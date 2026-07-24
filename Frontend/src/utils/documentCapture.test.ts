import { describe, expect, it } from 'vitest';
import {
  chatDocumentRejectReason,
  isValidChatDocument,
  MAX_CHAT_DOCUMENT_BYTES,
  mimeFromChatDocumentName,
} from './documentCapture';

function file(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('documentCapture', () => {
  it('accepts pdf by mime', () => {
    expect(isValidChatDocument(file('a.pdf', 'application/pdf', 100))).toBe(true);
  });

  it('accepts docx by extension when mime empty', () => {
    expect(isValidChatDocument(file('a.docx', '', 100))).toBe(true);
    expect(mimeFromChatDocumentName('a.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('rejects oversize', () => {
    expect(chatDocumentRejectReason(file('a.pdf', 'application/pdf', MAX_CHAT_DOCUMENT_BYTES + 1))).toBe(
      'too_large'
    );
  });

  it('rejects empty and unknown types', () => {
    expect(chatDocumentRejectReason(file('a.pdf', 'application/pdf', 0))).toBe('invalid_type');
    expect(chatDocumentRejectReason(file('a.exe', 'application/octet-stream', 10))).toBe('invalid_type');
  });
});
