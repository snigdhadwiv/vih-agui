const { AgenticUIBackend } = require('./server/core/agent.js');
const { createOpenAICompatibleAdapter } = require('./server/adapters/openai-compatible.js');
const { createAnthropicAdapter } = require('./server/adapters/anthropic.js');

module.exports = {
  AgenticUIBackend,
  createOpenAICompatibleAdapter,
  createAnthropicAdapter
};