import OpenAI from "openai";

function createJsonResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(data)
  };
}

function clampInteger(value, min = 0, max = 100) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return min;
  }

  return Math.max(min, Math.min(max, Math.round(numberValue)));
}

function extractOutputText(response) {
  if (response.output_text) {
    return response.output_text;
  }

  const outputText = response.output
    ?.flatMap((item) => item.content || [])
    ?.map((content) => content.text || "")
    ?.join("");

  return outputText || "";
}

function normalizeProbabilityResult(result, modelName) {
  const probabilityPercent = clampInteger(result.probabilityPercent, 0, 100);

  return {
    probability: Number((probabilityPercent / 100).toFixed(2)),
    probabilityPercent,
    kcProbabilities: {
      problemUnderstanding: clampInteger(
        result.kcProbabilities?.problemUnderstanding,
        0,
        100
      ),
      strategySelection: clampInteger(
        result.kcProbabilities?.strategySelection,
        0,
        100
      ),
      calculationExecution: clampInteger(
        result.kcProbabilities?.calculationExecution,
        0,
        100
      ),
      explanationJustification: clampInteger(
        result.kcProbabilities?.explanationJustification,
        0,
        100
      )
    },
    reason: String(
      result.reason || "정답 가능성 산출 이유가 제공되지 않았습니다."
    ),
    modelType: modelName
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return createJsonResponse(
      {
        error: "POST 요청만 허용됩니다."
      },
      405
    );
  }

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    const modelName = "o3-mini";

    if (!apiKey) {
      return createJsonResponse(
        {
          error: "OPENAI_API_KEY가 Netlify 환경변수에 설정되어 있지 않습니다."
        },
        500
      );
    }

    const body = JSON.parse(event.body || "{}");

    const problemId = String(body.problemId || "problem1");
    const problemText = String(body.problemText || "").trim();
    const studentInput = String(body.studentInput || "").trim();

    if (!studentInput) {
      return createJsonResponse(
        {
          error: "학생 풀이가 비어 있습니다."
        },
        400
      );
    }

    const client = new OpenAI({
      apiKey
    });

    const response = await client.responses.create({
      model: modelName,
      store: false,
      max_output_tokens: 900,
      instructions: `
당신은 대화형 수학 문제풀이 시스템에서 학생의 현재 풀이 발화를 평가하는 채점 보조자입니다.

목표:
- 학생의 현재 발화가 이 시점에서 정답 풀이로 이어질 가능성을 0~100 사이의 정수로 산출합니다.
- 화면에는 probabilityPercent만 표시되지만, 내부 저장을 위해 KC별 확률과 이유도 함께 산출합니다.
- 문제 맥락은 참고하되, 핵심 판단 근거는 학생의 현재 발화입니다.

평가 기준:
1. 문제 이해: 문제 조건, 구해야 하는 값, 상황 해석이 드러나는가
2. 전략 선택: 적절한 풀이 전략, 경우 나누기, 수학적 접근이 드러나는가
3. 계산 수행: 계산, 수식, 절차가 타당하게 진행되는가
4. 설명·정당화: 풀이가 왜 타당한지 설명하는가

주의:
- 정답만 짧게 쓴 경우 probabilityPercent를 80 이하로 제한합니다.
- 계산만 있고 설명이 부족한 경우 explanationJustification을 낮게 둡니다.
- 틀린 전략이 명확하면 probabilityPercent를 낮게 둡니다.
- 불확실하면 과도하게 높게 주지 말고 보수적으로 평가합니다.
- 반드시 JSON schema에 맞는 값만 반환합니다.
      `.trim(),
      input: JSON.stringify({
        problemId,
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
                description:
                  "학생의 현재 발화가 정답 풀이로 이어질 가능성. 0 이상 100 이하 정수."
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
                description:
                  "정답 가능성을 그렇게 산출한 간단한 이유. 내부 저장용."
              }
            },
            required: ["probabilityPercent", "kcProbabilities", "reason"]
          }
        }
      }
    });

    const outputText = extractOutputText(response);
    const parsed = JSON.parse(outputText);
    const normalized = normalizeProbabilityResult(parsed, modelName);

    return createJsonResponse(normalized, 200);
  } catch (error) {
    console.error("evaluate-probability error:", error);

    return createJsonResponse(
      {
        error:
          error?.message ||
          "정답 가능성 계산 중 알 수 없는 오류가 발생했습니다."
      },
      500
    );
  }
};