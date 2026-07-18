import { describe, it, expect } from 'vitest';
import { FileCategory, fileCategory } from '@gdoc/shared';

describe('fileCategory (packages/shared/src/dashboard.ts) — mapeamento MIME → categoria', () => {
  it.each([
    ['image/png', FileCategory.IMAGE],
    ['video/mp4', FileCategory.VIDEO],
    ['audio/mpeg', FileCategory.AUDIO],
    ['application/pdf', FileCategory.PDF],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', FileCategory.OFFICE],
    ['application/msword', FileCategory.OFFICE],
    ['text/plain', FileCategory.TEXT],
    ['application/x-unknown', FileCategory.OTHER],
  ])('%s → %s', (contentType, expected) => {
    expect(fileCategory(contentType)).toBe(expected);
  });

  it('content_type nulo mapeia para OTHER', () => {
    expect(fileCategory(null)).toBe(FileCategory.OTHER);
  });
});
