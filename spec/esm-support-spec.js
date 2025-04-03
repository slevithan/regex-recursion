// This file uses ESM syntax to test the ESM compatibility
import { recursion } from '../src/index.js';

describe('ESM support', () => {
  it('should export recursion function via import', () => {
    expect(typeof recursion).toBe('function');
  });
  
  it('should have proper function behavior', () => {
    const pattern = 'a(?R=2)?b';
    const result = recursion(pattern);
    
    expect(result).toEqual({
      pattern: 'a(?:a(?:)?b)?b',
      captureTransfers: jasmine.any(Map),
      hiddenCaptures: []
    });
  });
}); 
