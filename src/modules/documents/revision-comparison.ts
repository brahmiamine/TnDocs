export type RevisionPairResult =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "pair"; left: number; right: number };

export function parseRevisionPair(value: string | null): RevisionPairResult {
  if (value === null) return { kind: "none" };
  const parts = value.split(",");
  if (parts.length !== 2 || parts.some((part) => !/^[1-9]\d*$/.test(part))) return { kind: "invalid" };
  const left = Number(parts[0]);
  const right = Number(parts[1]);
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right) || left === right) return { kind: "invalid" };
  return { kind: "pair", left, right };
}
