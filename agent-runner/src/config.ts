function require(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),

  zerog: {
    apiKey: require('ZEROG_API_KEY'),
    model: optional('ZEROG_MODEL', 'zai-org/GLM-5-FP8'),
    baseURL: 'https://router-api.0g.ai/v1',
  },

  rpc: {
    url: require('RPC_URL'),
  },

  kv: {
    url: require('ZEROG_KV_URL'),
    streamId: require('ZEROG_KV_STREAM_ID'),
    privateKey: require('ZEROG_PRIVATE_KEY'),
    encryptionKey: Buffer.from(require('KV_ENCRYPTION_KEY'), 'hex'),
  },
};
