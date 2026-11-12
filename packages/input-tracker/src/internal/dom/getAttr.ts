import { isRecord } from "@/internal/isRecord";
import { getDatasetKey } from "@/internal/dom/getDatasetKey";

/**
 * Reads a string attribute from either dataset, `getAttribute`, or direct properties.
 */
export function getAttr(target: EventTarget | null, name: string): string | undefined {
  if (!isRecord(target)) {
    return undefined;
  }

  const dataset = target.dataset;

  if (isRecord(dataset)) {
    const datasetKey = getDatasetKey(name);
    const datasetValue = dataset[datasetKey];

    if (typeof datasetValue === "string" && datasetValue.length > 0) {
      return datasetValue;
    }
  }

  const getAttribute = target.getAttribute;

  if (typeof getAttribute === "function") {
    const attributeValue = getAttribute.call(target, name);

    if (typeof attributeValue === "string" && attributeValue.length > 0) {
      return attributeValue;
    }
  }

  const directValue = target[name];
  if (typeof directValue === "string" && directValue.length > 0) {
    return directValue;
  }

  return undefined;
}
