import { describe, it, expect } from 'vitest';
import { FileCategory, fileCategory, isPreviewable } from '@gdoc/shared';

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

describe('isPreviewable (packages/shared/src/dashboard.ts) — US 9.2 cenário 2', () => {
  it.each([
    ['application/pdf', true],
    ['image/png', true],
    ['video/mp4', true],
    ['audio/mpeg', true],
    ['text/plain', true],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', false],
    ['application/msword', false],
    ['application/x-unknown', false],
  ])('%s → previewable=%s', (contentType, expected) => {
    expect(isPreviewable(contentType)).toBe(expected);
  });

  it('content_type nulo não é pré-visualizável', () => {
    expect(isPreviewable(null)).toBe(false);
  });
});
