import { corsPreflightResponse, withCors } from "./lib/cors";
import { jsonResponse } from "./lib/json";
import { handleHealth } from "./routes/health";
import { handleAsr } from "./routes/asr";
import { handleClassifyIntent } from "./routes/classifyIntent";
import { handleAnswerQuestion } from "./routes/answerQuestion";
import { handleBargeIn } from "./routes/bargeIn";
import { handleStepGuidance } from "./routes/stepGuidance";
import { handleTts } from "./routes/tts";
import { handleAnalyzeRecipe } from "./routes/analyzeRecipe";
import { handleAudioUnderstand } from "./routes/audioUnderstand";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS" && path.startsWith("/vps/")) {
      return corsPreflightResponse();
    }

    try {
      if (path === "/vps/health" && request.method === "GET") {
        return withCors(handleHealth());
      }

      if (request.method === "POST") {
        if (path === "/vps/asr/transcribe") {
          return withCors(await handleAsr(request, env));
        }
        if (path === "/vps/ai/classify-intent") {
          return withCors(await handleClassifyIntent(request, env));
        }
        if (path === "/vps/ai/answer-question") {
          return withCors(await handleAnswerQuestion(request, env));
        }
        if (path === "/vps/ai/barge-in") {
          return withCors(await handleBargeIn(request, env));
        }
        if (path === "/vps/ai/generate-step-guidance") {
          return withCors(await handleStepGuidance(request, env));
        }
        if (path === "/vps/tts/synthesize") {
          return withCors(await handleTts(request, env));
        }
        if (path === "/vps/scheduler/analyze-recipe") {
          return withCors(await handleAnalyzeRecipe(request, env));
        }
        if (path === "/vps/audio/understand") {
          return withCors(await handleAudioUnderstand(request, env));
        }
      }
    } catch (e) {
      return withCors(
        jsonResponse(500, {
          error: e instanceof Error ? e.message : String(e),
        }),
      );
    }

    return env.ASSETS.fetch(request);
  },
};
