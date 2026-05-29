import { defineConfig, loadEnv } from "vite";
import OpenAI from "openai";

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";

    req.on("data", (chunk) => {
      body += chunk.toString();
    });

    req.on("end", () => {
      resolve(body);
    });

    req.on("error", (error) => {
      reject(error);
    });
  });
}

function normalizeProbabilityResult(result) {
  const probabilityPercent = Math.max(
    0,
    Math.min(100, Math.round(Number(result.probabilityPercent ?? 0)))
  );

  const probability = Number((probabilityPercent / 100).toFixed(2));

  return {
    probability,
    probabilityPercent,
    kcProbabilities: {
      problemUnderstanding: Math.max(
        0,
        Math.min(100, Math.round(Number(result.kcProbabilities?.problemUnderstanding ?? 0)))
      ),
      strategySelection: Math.max(
        0,
        Math.min(100, Math.round(Number(result.kcProbabilities?.strategySelection ?? 0)))
      ),
      calculationExecution: Math.max(
        0,
        Math.min(100, Math.round(Number(result.kcProbabilities?.calculationExecution ?? 0)))
      ),
      explanationJustification: Math.max(
        0,
        Math.min(100, Math.round(Number(result.kcProbabilities?.explanationJustification ?? 0)))
      )
    },
    reason: String(result.reason ?? "정답 가능성 산출 이유가 제공되지 않았습니다."),
    modelType: "openai-o3-mini"
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const openaiApiKey = env.OPENAI_API_KEY;

  return {
    plugins: [
      {
        name: "openai-probability-api",
        configureServer(server) {
          server.middlewares.use("/api/evaluate-probability", async (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify({ error: "Method Not Allowed" }));
              return;
            }

            try {
              if (!openaiApiKey) {
                throw new Error("OPENAI_API_KEY가 .env에 설정되어 있지 않습니다.");
              }

              const rawBody = await readRequestBody(req);
              const body = JSON.parse(rawBody || "{}");

              const problemText = String(body.problemText ?? "").trim();
              const studentInput = String(body.studentInput ?? "").trim();

              if (!studentInput) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json; charset=utf-8");
                res.end(JSON.stringify({ error: "studentInput이 비어 있습니다." }));
                return;
              }

              const client = new OpenAI({
                apiKey: openaiApiKey
              });

              const response = await client.responses.create({
                model: "o3-mini",
                store: false,
                max_output_tokens: 900,
                instructions: `
당신은 대화형 수학 문제풀이 시스템에서 학생의 현재 풀이 발화를 평가하는 채점 보조자입니다.

목표:
- 학생의 현재 발화가 이 시점에서 정답 풀이로 이어질 가능성을 0~100 사이의 정수로 산출합니다.
- 학생에게 직접 설명하는 피드백이 아니라, 시스템 내부 저장과 화면 표시를 위한 평가값을 산출합니다.
- 문제 맥락은 참고하되, 핵심 판단 근거는 학생의 현재 발화입니다.

평가 기준:
1. 문제 이해: 문제 조건, 구해야 하는 값, 상황 해석이 드러나는가
2. 전략 선택: 적절한 풀이 전략, 경우 나누기, 수학적 접근이 드러나는가
3. 계산 수행: 계산, 수식, 절차가 타당하게 진행되는가
4. 설명·정당화: 자신의 풀이가 왜 타당한지 설명하는가

주의:
- 정답만 짧게 쓴 경우에는 probabilityPercent를 80 이하로 제한합니다.
- 계산만 있고 이유가 부족한 경우에는 explanationJustification을 낮게 둡니다.
- 틀린 전략이 명확하면 probabilityPercent를 낮게 둡니다.
- 불확실하면 과도하게 높게 주지 말고 보수적으로 평가합니다.
- 반드시 JSON schema에 맞는 값만 반환합니다.
                `.trim(),
                input: JSON.stringify({
                  problemText,
                  studentInput
                }),
                text: {
                  format: {
                    type: "json_schema",
                    name: "probability_evaluation",
                    strict: true,
                    schema: {
                      type: "object",
                      additionalProperties: false,
                      properties: {
                        probabilityPercent: {
                          type: "integer",
                          description: "학생의 현재 발화가 정답 풀이로 이어질 가능성. 0 이상 100 이하 정수."
                        },
                        kcProbabilities: {
                          type: "object",
                          additionalProperties: false,
                          properties: {
                            problemUnderstanding: {
                              type: "integer",
                              description: "문제 이해 수준. 0 이상 100 이하 정수."
                            },
                            strategySelection: {
                              type: "integer",
                              description: "전략 선택 수준. 0 이상 100 이하 정수."
                            },
                            calculationExecution: {
                              type: "integer",
                              description: "계산 수행 수준. 0 이상 100 이하 정수."
                            },
                            explanationJustification: {
                              type: "integer",
                              description: "설명과 정당화 수준. 0 이상 100 이하 정수."
                            }
                          },
                          required: [
                            "problemUnderstanding",
                            "strategySelection",
                            "calculationExecution",
                            "explanationJustification"
                          ]
                        },
                        reason: {
                          type: "string",
                          description: "정답 가능성을 그렇게 산출한 간단한 이유."
                        }
                      },
                      required: ["probabilityPercent", "kcProbabilities", "reason"]
                    }
                  }
                }
              });

              const parsed = JSON.parse(response.output_text);
              const normalized = normalizeProbabilityResult(parsed);

              res.statusCode = 200;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(JSON.stringify(normalized));
            } catch (error) {
              console.error("OpenAI probability API error:", error);

              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json; charset=utf-8");
              res.end(
                JSON.stringify({
                  error: error.message || "정답 가능성 계산 중 오류가 발생했습니다."
                })
              );
            }
          });
        }
      }
    ]
  };
});