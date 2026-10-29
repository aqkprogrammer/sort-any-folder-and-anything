// Runs OpenAI's CLIP (ViT-B/32, 8-bit quantised ONNX) inside a Web Worker with transformers.js.
// Images and text become 512-d vectors in the same space, so "a photo of a cat" lands near cat photos.
// The model (~150 MB) is downloaded once from Hugging Face and cached by the browser.

import { AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, RawImage, env }
  from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.5.1';

env.allowLocalModels = false;
const MODEL = 'Xenova/clip-vit-base-patch32';
let processor, tokenizer, vision, text;

const normalize = (data, n, dim) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = data.slice(i * dim, (i + 1) * dim); let s = 0;
    for (let k = 0; k < dim; k++) s += v[k] * v[k];
    s = Math.sqrt(s) || 1; for (let k = 0; k < dim; k++) v[k] /= s;
    out.push(v);
  }
  return out;
};

const handlers = {
  async load() {
    const progress_callback = p => { if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); };
    const opts = { device: 'wasm', dtype: 'q8', progress_callback };
    [processor, tokenizer, vision, text] = await Promise.all([
      AutoProcessor.from_pretrained(MODEL), AutoTokenizer.from_pretrained(MODEL),
      CLIPVisionModelWithProjection.from_pretrained(MODEL, opts), CLIPTextModelWithProjection.from_pretrained(MODEL, opts),
    ]);
    return { model: MODEL, device: 'wasm' };
  },
  async images({ blobs }) {
    const imgs = await Promise.all(blobs.map(b => RawImage.fromBlob(b)));
    const { image_embeds } = await vision(await processor(imgs));
    return normalize(image_embeds.data, blobs.length, image_embeds.dims[1]);
  },
  async texts({ texts }) {
    const { text_embeds } = await text(tokenizer(texts, { padding: true, truncation: true }));
    return normalize(text_embeds.data, texts.length, text_embeds.dims[1]);
  },
};

self.onmessage = async ({ data }) => {
  try { self.postMessage({ id: data.id, result: await handlers[data.type](data) }); }
  catch (e) { self.postMessage({ id: data.id, error: String(e?.message || e) }); }
};
