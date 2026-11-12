/**
 * Converts a `data-*` attribute name into its dataset key form.
 */
export function getDatasetKey(name: string): string {
  const withoutDataPrefix = name.replace(/^data-/, "");
  const chunks = withoutDataPrefix.split("-");
  let datasetKey = "";

  for (const [index, chunk] of chunks.entries()) {
    if (index === 0) {
      datasetKey += chunk;
      continue;
    }

    const firstCharacter = chunk.charAt(0).toUpperCase();
    const remainingCharacters = chunk.slice(1);
    datasetKey += `${firstCharacter}${remainingCharacters}`;
  }

  return datasetKey;
}
