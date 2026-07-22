const rateLimit = require('../../lib/rateLimit');

describe('rateLimit.js', () => {

  it('allows first request within window', async () => {
    const result = await rateLimit('127.0.0.1', '/api/test', { max: 3, windowMs: 60000 });
    expect(result).toBe(true);
  });

  it('allows up to max requests', async () => {
    await rateLimit('10.0.0.1', '/api/test-max', { max: 2, windowMs: 60000 });
    const second = await rateLimit('10.0.0.1', '/api/test-max', { max: 2, windowMs: 60000 });
    expect(second).toBe(true);
  });

  it('blocks after exceeding max', async () => {
    const key = 'block-test-' + Date.now();
    await rateLimit(key, '/api/block', { max: 2, windowMs: 60000 });
    await rateLimit(key, '/api/block', { max: 2, windowMs: 60000 });
    const third = await rateLimit(key, '/api/block', { max: 2, windowMs: 60000 });
    expect(third).toBe(false);
  });

  it('different routes are independent', async () => {
    const key = 'route-test-' + Date.now();
    await rateLimit(key, '/api/routeA', { max: 1, windowMs: 60000 });
    const result = await rateLimit(key, '/api/routeB', { max: 1, windowMs: 60000 });
    expect(result).toBe(true);
  });

  it('different keys are independent', async () => {
    await rateLimit('ip-a', '/api/same-route', { max: 1, windowMs: 60000 });
    const result = await rateLimit('ip-b', '/api/same-route', { max: 1, windowMs: 60000 });
    expect(result).toBe(true);
  });

  it('resets after window expires', async () => {
    const key = 'window-test-' + Date.now();
    await rateLimit(key, '/api/window', { max: 1, windowMs: 100 });
    expect(await rateLimit(key, '/api/window', { max: 1, windowMs: 100 })).toBe(false);

    await new Promise(r => setTimeout(r, 120));
    const result = await rateLimit(key, '/api/window', { max: 1, windowMs: 100 });
    expect(result).toBe(true);
  });
});
