import "dotenv/config";

import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAI } from "@google/generative-ai";

async function chat() {
  if (!process.env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is missing. Add it to your .env");
  }

  // 1) Init Gemini client for chat
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // 2) Init Gemini embeddings
  const embeddings = new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    model: "text-embedding-004",
    // taskType: 'RETRIEVAL_QUERY', // optional for query embeddings
  });

  // 3) Attach to existing Qdrant collection
  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings,
    {
      url: "http://localhost:6333",
      collectionName: "chaicode-collection",
    }
  );

  // 4) Retrieve relevant chunks
  const userQuery = "JavaScript and Ajаx";
  const retriever = vectorStore.asRetriever({ k: 3 });
  const relevantDocs = await retriever.invoke(userQuery);

  // Format context for the prompt
  const context = relevantDocs
    .map((d, i) => {
      const page = d.metadata?.loc?.pageNumber ?? d.metadata?.page ?? "";
      return `Chunk ${i + 1}${page ? ` (page ${page})` : ""}:\n${
        d.pageContent
      }`;
    })
    .join("\n\n");

  const systemPrompt = `
You are an AI assistant. Answer the user's question strictly using the provided context extracted from a PDF. 
If the answer is not present in the context, say you don't have enough information.

Context:
${context}
`.trim();

  // 5) Call Gemini for the final answer
  const prompt = `${systemPrompt}\n\nUser question:\n${userQuery}`;
  const result = await chatModel.generateContent(prompt);

  const text = result.response.text();
  console.log("> " + text);
}

chat().catch((err) => {
  console.error("Chat failed:", err);
  process.exit(1);
});
