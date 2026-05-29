import { initializeApp, getApps } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "firebase/firestore";

import { firebaseConfig } from "./firebaseConfig.js";

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const db = getFirestore(app);

const loginForm = document.querySelector("#studentLoginForm");
const loginButton = document.querySelector("#loginButton");
const loginMessage = document.querySelector("#loginMessage");

const classNumberInput = document.querySelector("#classNumber");
const studentNumberInput = document.querySelector("#studentNumber");

const STORAGE_KEY = "mathTutoringStudentSession";
const NEXT_PAGE_URL = "./chatbot.html";

function showMessage(message, type = "info") {
  loginMessage.textContent = message;
  loginMessage.className = `login-message ${type}`;
}

function setLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButton.textContent = isLoading ? "저장 중..." : "로그인하고 시작하기";
}

function getPositiveInteger(value) {
  const trimmedValue = String(value).trim();

  if (!trimmedValue) {
    return "";
  }

  const numberValue = Number(trimmedValue);

  if (!Number.isInteger(numberValue) || numberValue < 1) {
    return "";
  }

  return String(numberValue);
}

function createStudentNickname(classNumber, studentNumber) {
  return `math${classNumber}-${studentNumber}`;
}

function createStudentSession(classNumber, studentNumber) {
  const studentNickname = createStudentNickname(classNumber, studentNumber);

  return {
    classNumber: Number(classNumber),
    studentNumber: Number(studentNumber),
    studentNickname,
    loginAt: new Date().toISOString()
  };
}

async function saveStudentToFirestore(session) {
  const studentDocRef = doc(db, "student", session.studentNickname);

  await setDoc(
    studentDocRef,
    {
      studentNickname: session.studentNickname,
      classNumber: session.classNumber,
      studentNumber: session.studentNumber,
      lastLoginAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}

function saveStudentSessionToLocalStorage(session) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearLoginInputs() {
  loginForm.reset();

  classNumberInput.value = "";
  studentNumberInput.value = "";
  loginMessage.textContent = "";
  loginMessage.className = "login-message";
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  const classNumber = getPositiveInteger(classNumberInput.value);
  const studentNumber = getPositiveInteger(studentNumberInput.value);

  showMessage("");

  if (!classNumber) {
    showMessage("반을 숫자로 입력해 주세요.", "error");
    classNumberInput.focus();
    return;
  }

  if (!studentNumber) {
    showMessage("번호를 숫자로 입력해 주세요.", "error");
    studentNumberInput.focus();
    return;
  }

  const studentSession = createStudentSession(classNumber, studentNumber);

  setLoading(true);

  try {
    await saveStudentToFirestore(studentSession);
    saveStudentSessionToLocalStorage(studentSession);

    showMessage("로그인이 완료되었습니다.", "success");

    setTimeout(() => {
      window.location.href = NEXT_PAGE_URL;
    }, 300);
  } catch (error) {
    console.error("Firestore 저장 실패:", error);

    if (error.code === "permission-denied") {
      showMessage("Firestore 권한 문제입니다. 규칙을 확인해 주세요.", "error");
    } else {
      showMessage(`저장 실패: ${error.message}`, "error");
    }
  } finally {
    setLoading(false);
  }
}

loginForm.addEventListener("submit", handleLoginSubmit);

window.addEventListener("DOMContentLoaded", clearLoginInputs);
window.addEventListener("pageshow", clearLoginInputs);