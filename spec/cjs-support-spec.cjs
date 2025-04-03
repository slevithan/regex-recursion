// This file uses CommonJS syntax to test the CJS compatibility
const {recursion} = require('../dist/cjs/index.cjs');

describe('CommonJS support', () => {
  it('should export recursion function via require()', () => {
    expect(typeof recursion).toBe('function');
  });

  it('should have proper function behavior', () => {
    const pattern = 'a(?R=2)?b';
    const result = recursion(pattern);
    
    expect(result.pattern).toBe('a(?:a(?:)?b)?b');
    expect(result.captureTransfers instanceof Map).toBe(true);
    expect(Array.isArray(result.hiddenCaptures)).toBe(true);
  });
}); 
