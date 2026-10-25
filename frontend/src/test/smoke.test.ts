import { describe, it, expect } from 'vitest';

describe('UI Smoke Test', () => {
  it('runs vitest with jsdom environment', () => {
    expect(window).toBeDefined();
    expect(document).toBeDefined();
    expect(1 + 1).toBe(2);
  });
});
