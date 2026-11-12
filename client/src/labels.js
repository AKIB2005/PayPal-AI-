// Human-readable names for the PayPal layer that served a request.
export const engineLabel = (engine, mode) => (engine === 'agent-toolkit' ? 'Agent Toolkit' : engine === 'rest' ? 'REST API' : engine === 'mock' ? 'mock' : mode || '');
export const viaLabel = (via) => (via === 'agent-toolkit' ? 'Agent Toolkit' : via === 'rest' ? 'REST' : via === 'mock' ? 'mock' : via);
