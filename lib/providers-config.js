const PROVIDERS_CONFIG = {
  groq: {
    label: 'Groq (ultra-rapide)',
    needsKey: 'GROQ_API_KEY',
    models: [
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B', free: true },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B', free: true },
    ],
    default: 'llama-3.3-70b-versatile',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    envKey: 'GROQ_API_KEY',
  },
  openrouter: {
    label: 'OpenRouter (28+ models)',
    needsKey: 'OPENROUTER_API_KEY',
    models: [
      { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', free: true },
      { id: 'deepseek/deepseek-chat', label: 'DeepSeek V3', free: true },
      { id: 'deepseek/deepseek-r1', label: 'DeepSeek R1', free: true },
      { id: 'google/gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite', free: true },
      { id: 'meta-llama/llama-4-scout', label: 'Llama 4 Scout (10M ctx)', free: true },
    ],
    default: 'meta-llama/llama-3.3-70b-instruct',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    envKey: 'OPENROUTER_API_KEY',
  },
  cerebras: {
    label: 'Cerebras (2000+ tok/s)',
    needsKey: 'CEREBRAS_API_KEY',
    models: [
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', free: true },
      { id: 'zai-glm-4.7', label: 'ZAI GLM 4.7', free: true },
    ],
    default: 'gpt-oss-120b',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    envKey: 'CEREBRAS_API_KEY',
  },
  mistral: {
    label: 'Mistral (1B tok/mois)',
    needsKey: 'MISTRAL_API_KEY',
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small', free: true },
      { id: 'mistral-large-latest', label: 'Mistral Large', free: true },
      { id: 'codestral-latest', label: 'Codestral', free: true },
    ],
    default: 'mistral-small-latest',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    envKey: 'MISTRAL_API_KEY',
  },
};

module.exports = { PROVIDERS_CONFIG };
