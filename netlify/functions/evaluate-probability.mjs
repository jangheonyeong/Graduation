import OpenAI from "openai";

const PROBLEM_CONTEXT = {
  problemId: "problem1",
  title: "사탕 나누기 과부족 문제",
  problemText:
    "어떤 반에서 사탕을 나누어 주려고 합니다. 학생 한 명에게 5개씩 나누어 주면 사탕이 7개 남고, 학생 한 명에게 6개씩 나누어 주면 사탕이 5개 부족합니다. 이 반의 학생 수는 몇 명입니까?",
  finalAnswer: "12명",
  knowledgeComponents: [
    "학생 수를 미지수로 설정하기",
    "학생 한 명에게 5개씩 줄 때의 전체 사탕 수를 5x+7로 표현하기",
    "학생 한 명에게 6개씩 줄 때의 전체 사탕 수를 6x-5로 표현하기",
    "두 식이 모두 전체 사탕 수를 나타낸다는 관계를 이용하여 방정식 세우기",
    "일차방정식 5x+7=6x-5를 정확히 풀기",
    "구한 값을 학생 수로 해석하기"
  ],
  solution:
    "학생 수를 x명이라고 하면, 학생 한 명에게 5개씩 줄 때 필요한 사탕 수는 5x개이다. 이때 사탕이 7개 남으므로 전체 사탕 수는 5x+7개이다. 학생 한 명에게 6개씩 주려면 6x개의 사탕이 필요하다. 그런데 사탕이 5개 부족하므로 실제 전체 사탕 수는 6x-5개이다. 두 식은 모두 전체 사탕 수를 나타내므로 5x+7=6x-5이다. 이를 풀면 7=x-5, x=12이다. 따라서 이 반의 학생 수는 12명이다."
};

const PROBABILITY_SCHEMA = {
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
        variableRepresentation: {
          type: "integer",
          description:
            "미지수 설정 및 수량 표현 수준. 0 이상 100 이하 정수."
        },
        quantityRelationship: {
          type: "integer",
          description:
            "남음과 부족함의 수량 관계 이해 수준. 0 이상 100 이하 정수."
        },
        equationConstruction: {
          type: "integer",
          description: "일차방정식 구성 수준. 0 이상 100 이하 정수."
        },
        equationSolving: {
          type: "integer",
          description: "방정식 풀이 및 계산 수행 수준. 0 이상 100 이하 정수."
        },
        answerInterpretation: {
          type: "integer",
          description: "답 해석 및 최종 답 제시 수준. 0 이상 100 이하 정수."
        }
      },
      required: [
        "problemUnderstanding",
        "variableRepresentation",
        "quantityRelationship",
        "equationConstruction",
        "equationSolving",
        "answerInterpretation"
      ]
    },
    reason: {
      type: "string",
      description:
        "정답 가능성을 그렇게 산출한 간단한 이유. 내부 저장용. 80자 이내의 한 문장."
    }
  },
  required: ["probabilityPercent", "kcProbabilities", "reason"]
};

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

function parseJsonOutput(outputText) {
  const trimmedText = String(outputText || "").trim();

  if (!trimmedText) {
    throw new Error("OpenAI 응답이 비어 있습니다.");
  }

  try {
    return JSON.parse(trimmedText);
  } catch (firstError) {
    const firstBraceIndex = trimmedText.indexOf("{");
    const lastBraceIndex = trimmedText.lastIndexOf("}");

    if (firstBraceIndex >= 0 && lastBraceIndex > firstBraceIndex) {
      const jsonCandidate = trimmedText.slice(firstBraceIndex, lastBraceIndex + 1);

      try {
        return JSON.parse(jsonCandidate);
      } catch (secondError) {
        throw firstError;
      }
    }

    throw firstError;
  }
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
      variableRepresentation: clampInteger(
        result.kcProbabilities?.variableRepresentation,
        0,
        100
      ),
      quantityRelationship: clampInteger(
        result.kcProbabilities?.quantityRelationship,
        0,
        100
      ),
      equationConstruction: clampInteger(
        result.kcProbabilities?.equationConstruction,
        0,
        100
      ),
      equationSolving: clampInteger(
        result.kcProbabilities?.equationSolving,
        0,
        100
      ),
      answerInterpretation: clampInteger(
        result.kcProbabilities?.answerInterpretation,
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

function buildInstructions({ isRetry = false } = {}) {
  const retryInstruction = isRetry
    ? `
이번 응답은 반드시 유효한 JSON이어야 합니다.
이전 응답처럼 문자열이 끊기거나 따옴표가 닫히지 않으면 안 됩니다.
reason은 반드시 80자 이내의 짧은 한 문장으로 작성합니다.
reason 안에는 큰따옴표를 사용하지 않습니다.
줄바꿈 없이 JSON 객체 하나만 반환합니다.
`
    : "";

  return `
당신은 중학교 1학년 일차방정식의 활용 문제를 풀이하는 학생의 현재 발화를 평가하는 채점 보조자입니다.

역할:
- 학생의 현재 발화가 이 시점에서 정답 풀이로 이어질 가능성을 0~100 사이의 정수로 산출합니다.
- 이 값은 학생에게 직접 제시되는 "정답 가능성"입니다.
- 화면에는 probabilityPercent만 표시되지만, 내부 저장을 위해 지식요소별 점수와 이유도 함께 산출합니다.
- 학생에게 해설이나 피드백을 제공하지 말고, 반드시 JSON만 반환합니다.

현재 평가할 문제:
${PROBLEM_CONTEXT.problemText}

정답:
${PROBLEM_CONTEXT.finalAnswer}

모범 풀이:
${PROBLEM_CONTEXT.solution}

문항 지식요소:
${PROBLEM_CONTEXT.knowledgeComponents
  .map((kc, index) => `${index + 1}. ${kc}`)
  .join("\n")}

중요한 평가 원칙:
- 학생의 현재 발화만 따로 떼어 평가하지 말고, 문제 맥락, 문항 지식요소, 모범 풀이, 현재 발화를 함께 고려합니다.
- 단, 학생이 실제로 드러낸 풀이 증거를 가장 중요한 판단 근거로 삼습니다.
- 학생이 최종 답을 쓰지 않았더라도 미지수 설정, 수량 관계 표현, 방정식 구성이 타당하면 정답 가능성을 높게 줄 수 있습니다.
- 반대로 최종 답만 쓴 경우에는 풀이 과정 증거가 부족하므로 probabilityPercent를 80 이하로 제한합니다.
- 정답인 12명만 쓴 경우에도 식과 설명이 없으면 높은 점수를 주지 않습니다.
- 학생 수를 x명으로 설정하면 variableRepresentation을 높게 평가합니다.
- 5개씩 주면 7개 남는 상황을 5x+7로 표현하면 quantityRelationship을 높게 평가합니다.
- 6개씩 주면 5개 부족한 상황을 6x-5로 표현하면 quantityRelationship을 높게 평가합니다.
- 특히 "5개 부족하다"를 6x+5로 잘못 표현하는 오류는 중요한 수량 관계 오류로 봅니다.
- 5x+7=6x-5 또는 이와 동치인 방정식을 세우면 equationConstruction을 높게 평가합니다.
- 식은 맞지만 계산 실수가 있으면 equationConstruction은 비교적 높게, equationSolving은 낮게 평가합니다.
- 문제 상황을 오해했거나 남는 경우와 부족한 경우를 반대로 해석하면 probabilityPercent를 낮게 줍니다.
- 불확실하면 과도하게 높게 주지 말고 보수적으로 평가합니다.
- 학생에게 보이는 것은 숫자뿐이므로, 지나치게 출렁이는 점수를 피하고 현재 풀이 증거에 따라 일관되게 평가합니다.

지식요소별 평가 기준:
1. problemUnderstanding
- 사탕을 나누어 주는 상황, 5개씩 주면 남고 6개씩 주면 부족하다는 조건, 구해야 하는 값이 학생 수라는 점을 이해한 정도입니다.

2. variableRepresentation
- 학생 수를 미지수로 설정하고, 그 미지수를 기준으로 사탕의 수를 표현하려는 정도입니다.

3. quantityRelationship
- 5개씩 주면 7개 남는 경우를 5x+7로, 6개씩 주면 5개 부족한 경우를 6x-5로 해석하는 정도입니다.

4. equationConstruction
- 두 식이 모두 전체 사탕 수를 나타낸다는 관계를 이용하여 일차방정식을 적절히 구성하는 정도입니다.

5. equationSolving
- 세운 방정식을 정확하게 풀고 계산을 타당하게 수행하는 정도입니다.

6. answerInterpretation
- 구한 값 12를 학생 수로 해석하고 단위를 적절히 제시하는 정도입니다.

probabilityPercent 산출 기준:
- 0~20: 문제와 관련 없는 발화, 조건 이해가 거의 없음, 풀이 증거가 없음
- 21~40: 일부 조건을 언급하지만 남음과 부족함의 관계 해석이 부정확함
- 41~60: 학생 수를 미지수로 설정하거나 일부 관계를 표현했지만 핵심 방정식이 불완전함
- 61~75: 적절한 방향의 식 또는 전략이 있으나 수량 관계, 계산, 해석 중 일부가 부족함
- 76~90: 풀이 과정이 대체로 타당하고 정답에 거의 도달했으나 설명이나 해석이 일부 부족함
- 91~100: 문제 이해, 미지수 설정, 수량 관계 표현, 방정식 구성, 계산, 답 해석이 모두 타당함

반환 형식:
- 반드시 JSON schema에 맞는 값만 반환합니다.
- reason은 내부 저장용입니다.
- reason은 80자 이내의 짧은 한 문장으로 작성합니다.
- reason 안에는 큰따옴표를 사용하지 않습니다.
- JSON 밖에 설명 문장을 절대 쓰지 않습니다.

${retryInstruction}
  `.trim();
}

async function requestEvaluationFromOpenAI({
  client,
  modelName,
  inputPayload,
  isRetry = false
}) {
  return await client.responses.create({
    model: modelName,
    store: false,
    max_output_tokens: 1800,
    instructions: buildInstructions({ isRetry }),
    input: JSON.stringify(inputPayload),
    text: {
      format: {
        type: "json_schema",
        name: "probability_evaluation",
        strict: true,
        schema: PROBABILITY_SCHEMA
      }
    }
  });
}

async function requestParsedEvaluation({ client, modelName, inputPayload }) {
  const firstResponse = await requestEvaluationFromOpenAI({
    client,
    modelName,
    inputPayload,
    isRetry: false
  });

  const firstOutputText = extractOutputText(firstResponse);

  try {
    return parseJsonOutput(firstOutputText);
  } catch (firstParseError) {
    console.warn("첫 번째 OpenAI JSON 파싱 실패. 재요청합니다.", {
      message: firstParseError.message,
      outputText: firstOutputText
    });

    const retryResponse = await requestEvaluationFromOpenAI({
      client,
      modelName,
      inputPayload,
      isRetry: true
    });

    const retryOutputText = extractOutputText(retryResponse);

    try {
      return parseJsonOutput(retryOutputText);
    } catch (retryParseError) {
      console.error("재요청 후에도 OpenAI JSON 파싱 실패:", {
        message: retryParseError.message,
        outputText: retryOutputText
      });

      throw new Error(
        "OpenAI 응답을 JSON으로 읽지 못했습니다. 잠시 후 다시 제출해 주세요."
      );
    }
  }
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

    const initialConfidencePercent =
      body.initialConfidencePercent === null ||
      body.initialConfidencePercent === undefined
        ? null
        : clampInteger(body.initialConfidencePercent, 0, 100);

    const finalAnswerText = String(body.finalAnswerText || "").trim();

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

    const inputPayload = {
      problemId,
      problemText: problemText || PROBLEM_CONTEXT.problemText,
      registeredProblemText: PROBLEM_CONTEXT.problemText,
      finalAnswer: PROBLEM_CONTEXT.finalAnswer,
      modelSolution: PROBLEM_CONTEXT.solution,
      knowledgeComponents: PROBLEM_CONTEXT.knowledgeComponents,
      studentInput,
      initialConfidencePercent,
      finalAnswerText
    };

    const parsed = await requestParsedEvaluation({
      client,
      modelName,
      inputPayload
    });

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