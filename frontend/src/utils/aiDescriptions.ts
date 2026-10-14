export function descriptionKey(text: string) {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/[\p{P}\p{Z}\s]+/gu, '').trim()
}

export function duplicateDescription(text: string, others: string[]) {
  const key = descriptionKey(text)
  return !!key && others.some(other => descriptionKey(other) === key)
}

// One retry is intentional: repeated boilerplate must never be silently applied.
export async function generateDistinctDescription<T extends { description: string }>(
  generate: (avoid: string[]) => Promise<T>, previous: string[],
): Promise<T> {
  let avoid = previous.slice(-3)
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await generate(avoid)
    if (!descriptionKey(result.description)) throw new Error('模型未生成有效描述，原文保留')
    if (!duplicateDescription(result.description, previous)) return result
    avoid = [...previous.slice(-2), result.description]
  }
  throw new Error('描述与其他视频重复，已重写一次仍重复；请补充本条参数后重试，原文保留')
}
