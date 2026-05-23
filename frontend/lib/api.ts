import axios from "axios";

const API = "http://localhost:8000";

export const uploadPDF = async (file: File) => {
  const formData = new FormData();
  formData.append("file", file);

  const res = await axios.post(`${API}/upload/pdf`, formData);
  return res.data;
};

export const askQuestion = async (question: string) => {
  const res = await axios.post(`${API}/chat/`, {
    question,
  });

  return res.data;
};