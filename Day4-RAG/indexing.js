import "dotenv/config";

import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";

async function init() {
  // Ensure your .env has: GOOGLE_API_KEY=your_gemini_key
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is missing. Add it to your .env");
  }

  const pdfFilePath = "./jsnoo.pdf";
  const loader = new PDFLoader(pdfFilePath);
  const docs = await loader.load();

  // Gemini embeddings
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "text-embedding-004", // current Gemini embeddings model
    // taskType: 'RETRIEVAL_DOCUMENT', // optional
  });

  const vectorStore = await QdrantVectorStore.fromDocuments(docs, embeddings, {
    url: "http://localhost:6333",
    collectionName: "chaicode-collection",
  });

  console.log("Indexing of documents done...");
}

init().catch((err) => {
  console.error("Indexing failed:", err);
  process.exit(1);
});
