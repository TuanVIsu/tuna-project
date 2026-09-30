// utils/gemini.js
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
  apiVersion: 'v1',
});

const FALLBACK_MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite'];

async function generateContentWithFallback(prompt, config) {
  let lastError = null;

  for (const modelName of FALLBACK_MODELS) {
    try {
      console.log(`🤖 Đang thử gọi model: ${modelName}...`);
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config,
      });

      console.log(`✅ Gọi thành công qua model: ${modelName}`);
      return response.text;
    } catch (err) {
      console.warn(`⚠️ Model ${modelName} gặp sự cố: ${err.message}. Đang chuyển model dự phòng...`);
      lastError = err;
    }
  }

  throw new Error(`Tất cả model Gemini đều không khả dụng: ${lastError?.message}`);
}

module.exports = { generateContentWithFallback };