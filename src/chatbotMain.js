import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from "firebase/firestore";

import { firebaseConfig } from "./firebaseConfig.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

const STORAGE_KEY = "mathTutoringStudentSession";
const PROBLEM_ID = "problem1";

const studentNicknameText = document.querySelector("#studentNicknameText");
const problemTextElement = document.querySelector("#problemText");

const solutionForm = document.querySelector("#solutionForm");
const studentInput = document.querySelector("#studentInput");
const submitButton = document.querySelector("#submitButton");
const submitMessage = document.querySelector("#submitMessage");

const probabilityGauge = document.querySelector("#probabilityGauge");
const probabilityValue = document.querySelector("#probabilityValue");

const historyButton = document.querySelector("#historyButton");
const closeHistoryButton = document.querySelector("#closeHistoryButton");
const historyDrawer = document.querySelector("#historyDrawer");
const drawerOverlay = document.querySelector("#drawerOverlay");
const historyList = document.querySelector("#historyList");

let currentStudentSession = null;
let currentProblemText = "";
let currentHistoryCount = 0;

function getStudentSession() {
  const savedSession = localStorage.getItem(STORAGE_KEY);

  if (!savedSession) return null;

  try {
    return JSON.parse(savedSession);
  } catch (error) {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function showSubmitMessage(message, type = "info") {
  submitMessage.textContent = message;
  submitMessage.className = `submit-message ${type}`;
}

function setSubmitting(isSubmitting) {
  submitButton.disabled = isSubmitting;
  submitButton.textContent = isSubmitting ? "정답 가능성 계산 중..." : "풀이 제출하기";
}

function updateProbabilityUI(result) {
  const probabilityPercent = result.probabilityPercent;

  probabilityGauge.style.setProperty("--probability-fill", `${probabilityPercent}%`);
  probabilityValue.textContent = String(probabilityPercent);
}

async function requestProbabilityFromOpenAI(studentInputText) {
  const response = await fetch("/api/evaluate-probability", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      problemId: PROBLEM_ID,
      problemText: currentProblemText,
      studentInput: studentInputText
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "정답 가능성 계산 요청에 실패했습니다.");
  }

  return data;
}

async function loadProblem() {
  const problemDocRef = doc(db, "problem", PROBLEM_ID);
  const problemSnap = await getDoc(problemDocRef);

  if (!problemSnap.exists()) {
    currentProblemText =
      "문제를 불러오지 못했습니다. Firestore의 problem/problem1 문서를 확인해 주세요.";
    problemTextElement.textContent = currentProblemText;
    return;
  }

  const problemData = problemSnap.data();
  currentProblemText = problemData.problem || "문제 내용이 비어 있습니다.";
  problemTextElement.textContent = currentProblemText;
}

async function saveConversationLog({ studentInputText, probabilityResult }) {
  const conversationRef = collection(
    db,
    "student",
    currentStudentSession.studentNickname,
    "conversation"
  );

  await addDoc(conversationRef, {
    studentNickname: currentStudentSession.studentNickname,
    problemId: PROBLEM_ID,
    problemText: currentProblemText,

    turnNumber: currentHistoryCount + 1,

    studentLog: studentInputText,
    studentInput: studentInputText,

    probability: probabilityResult.probability,
    probabilityPercent: probabilityResult.probabilityPercent,

    kcProbabilities: probabilityResult.kcProbabilities,
    probabilityReason: probabilityResult.reason,
    probabilityModelType: probabilityResult.modelType,

    createdAt: serverTimestamp(),
    createdAtLocal: new Date().toISOString()
  });
}

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHistory(items) {
  currentHistoryCount = items.length;

  if (items.length === 0) {
    historyList.innerHTML = `<p class="empty-history">아직 저장된 풀이 기록이 없습니다.</p>`;
    return;
  }

  historyList.innerHTML = items
    .map((item, index) => {
      const turnNumber = item.turnNumber || index + 1;
      const probability = item.probabilityPercent ?? 0;
      const createdAtText = formatDateTime(item.createdAtLocal);

      return `
        <article class="history-card">
          <div class="history-card-header">
            <strong>Turn ${turnNumber}</strong>
            <span>${createdAtText}</span>
          </div>

          <p class="student-log">${escapeHtml(item.studentLog || item.studentInput || "")}</p>
          <p>정답 가능성: <strong>${probability}</strong> / 100</p>
        </article>
      `;
    })
    .join("");
}

function listenToHistory() {
  const conversationRef = collection(
    db,
    "student",
    currentStudentSession.studentNickname,
    "conversation"
  );

  const historyQuery = query(conversationRef, orderBy("createdAtLocal", "asc"));

  onSnapshot(
    historyQuery,
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }));

      renderHistory(items);
    },
    (error) => {
      console.error("히스토리 불러오기 실패:", error);
    }
  );
}

async function handleSolutionSubmit(event) {
  event.preventDefault();

  const inputText = studentInput.value.trim();

  if (!inputText) {
    showSubmitMessage("풀이를 입력해 주세요.", "error");
    studentInput.focus();
    return;
  }

  setSubmitting(true);
  showSubmitMessage("");

  try {
    const probabilityResult = await requestProbabilityFromOpenAI(inputText);

    updateProbabilityUI(probabilityResult);

    await saveConversationLog({
      studentInputText: inputText,
      probabilityResult
    });

    showSubmitMessage("풀이와 정답 가능성이 저장되었습니다.", "success");
    studentInput.value = "";
  } catch (error) {
    console.error("풀이 처리 실패:", error);
    showSubmitMessage(`처리 실패: ${error.message}`, "error");
  } finally {
    setSubmitting(false);
  }
}

function openHistoryDrawer() {
  historyDrawer.removeAttribute("inert");
  historyDrawer.setAttribute("aria-hidden", "false");

  historyDrawer.classList.add("open");
  drawerOverlay.classList.add("open");

  closeHistoryButton.focus();
}

function closeHistoryDrawer() {
  if (historyDrawer.contains(document.activeElement)) {
    historyButton.focus();
  }

  historyDrawer.classList.remove("open");
  drawerOverlay.classList.remove("open");

  historyDrawer.setAttribute("aria-hidden", "true");
  historyDrawer.setAttribute("inert", "");
}

async function initPage() {
  currentStudentSession = getStudentSession();

  if (!currentStudentSession || !currentStudentSession.studentNickname) {
    window.location.href = "./index.html";
    return;
  }

  studentNicknameText.textContent = currentStudentSession.studentNickname;

  await loadProblem();
  listenToHistory();
}

solutionForm.addEventListener("submit", handleSolutionSubmit);
historyButton.addEventListener("click", openHistoryDrawer);
closeHistoryButton.addEventListener("click", closeHistoryDrawer);
drawerOverlay.addEventListener("click", closeHistoryDrawer);

initPage();