// M1-D-KNOWLEDGE F003 — 解析产物提取/构建纯函数单测（不打库不打网关）。
//
// extractJsonObject：ai-action-contract §1.3 双 shape 兼容（栅栏/裸对象/前后杂文）；
// draftsFromLlmOutput：只为非空类别建行 + content/structured 同源。

import { describe, it, expect } from 'vitest';
import {
  extractJsonObject,
  draftsFromLlmOutput,
  buildImageUserContent,
} from '../../src/lib/knowledge/parse';
import { parseLlmOutput } from '../../src/lib/data/schemas/knowledge';

const VALID = {
  selling_points: ['卖点A'],
  audience_slices: [{ label: '硬核', percent: 60 }],
  compliance_redlines: ['#ad 披露'],
  confidence: 0.7,
};

describe('extractJsonObject（双 shape 兼容）', () => {
  it('裸 JSON 对象直接解析', () => {
    expect(extractJsonObject(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('markdown 栅栏（```json）内的对象可提取', () => {
    expect(
      extractJsonObject('```json\n' + JSON.stringify(VALID) + '\n```'),
    ).toEqual(VALID);
  });

  it('前后带说明文字的对象可提取（截取 {..} 区间）', () => {
    expect(
      extractJsonObject(
        '好的，以下是解析结果：\n' + JSON.stringify(VALID) + '\n以上。',
      ),
    ).toEqual(VALID);
  });

  it('完全不含 JSON → null（不抛错）', () => {
    expect(extractJsonObject('抱歉，我无法解析这份素材。')).toBeNull();
    expect(extractJsonObject('')).toBeNull();
  });
});

describe('draftsFromLlmOutput（只为非空类别建行）', () => {
  it('三类齐备 → 3 行草稿，content 与 structured 同源', () => {
    const out = parseLlmOutput(VALID)!;
    const drafts = draftsFromLlmOutput(out);
    expect(drafts.map((d) => d.kind)).toEqual([
      'selling_point',
      'audience',
      'compliance_redline',
    ]);
    expect(drafts[0].content).toBe('卖点A');
    expect(drafts[0].structured).toEqual({ points: ['卖点A'] });
    expect(drafts[1].content).toContain('硬核 60%');
    expect(drafts[1].structured).toEqual({
      slices: [{ label: '硬核', percent: 60 }],
    });
    expect(drafts[2].structured).toEqual({ rules: ['#ad 披露'] });
  });

  it('部分类别为空 → 不为空类别建行（不注水）', () => {
    const out = parseLlmOutput({ selling_points: ['只有卖点'] })!;
    const drafts = draftsFromLlmOutput(out);
    expect(drafts.length).toBe(1);
    expect(drafts[0].kind).toBe('selling_point');
  });
});

describe('buildImageUserContent（M2-A F009 / OBS-1：ImagePart → FilePart 迁移）', () => {
  const INPUT = {
    prompt: '请解析这张图',
    imageBytes: Buffer.from('fake-image-bytes'),
    imageMediaType: 'image/png',
  };

  it('图片以 FilePart（type:file + data + mediaType）承载，text part 随后', () => {
    const parts = buildImageUserContent(INPUT);
    expect(parts).toEqual([
      { type: 'file', data: INPUT.imageBytes, mediaType: 'image/png' },
      { type: 'text', text: '请解析这张图' },
    ]);
  });

  it('弃用告警消除：构造出的消息不含任何 type:"image" 弃用 part 形态', () => {
    const parts = buildImageUserContent(INPUT) as Array<{ type: string }>;
    expect(parts.some((p) => p.type === 'image')).toBe(false);
    expect(parts.some((p) => 'image' in (p as object))).toBe(false); // 旧 ImagePart 的 image 字段也零残留
  });

  it('mediaType 缺省兜底顶级段 image（FilePart.mediaType 必填）', () => {
    const parts = buildImageUserContent({
      prompt: 'p',
      imageBytes: Buffer.from('x'),
    });
    expect(parts[0]).toMatchObject({ type: 'file', mediaType: 'image' });
  });
});
