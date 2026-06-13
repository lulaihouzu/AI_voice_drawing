const objectNounPattern = /(节点|图形|对象|形状|元素)$/;
const fillerPattern = /^(把|将|给|这个|那个|当前|刚才|刚刚|一个|一条|一只|该)/;

export function normalizeObjectName(value?: string) {
  const name = value
    ?.trim()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?；;：“”"'「」]/g, "")
    .replace(fillerPattern, "")
    .replace(/^(命名为|取名为|改名为|叫做|名字叫|名为)/, "")
    .replace(/(一点点|一点|一些)$/, "")
    .replace(objectNounPattern, "")
    .trim();

  return name || undefined;
}

export function isActiveReference(value?: string) {
  if (!value) {
    return true;
  }

  const normalized = value.trim().replace(/\s+/g, "");

  return /^(它|这个|那个|当前|刚才|刚刚)/.test(normalized);
}
