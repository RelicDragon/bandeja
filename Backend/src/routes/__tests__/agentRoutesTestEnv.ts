/**
 * Imported first by `agent.routes.http.integration.test.ts`, before `config/env` loads:
 * no real LLM key (POST /messages must never reach DeepSeek from a test).
 * `dotenv` does not override variables that are already set.
 */
process.env.DEEPSEEK_API_KEY = '';

export {};
