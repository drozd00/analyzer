# Privacy and Data Handling

## Default Privacy Contract

Browser event payloads contain interaction metadata. Ordinary typed characters, field values and pasted text are excluded.

Allowed by default:

- command-like keys such as `Tab`, `Enter`, `Escape`, and `Ctrl+V`
- editing metadata such as `inputType`, selection ranges, and `valueLength`
- pointer coordinates and focus transitions
- semantic ids like `formId` and `fieldId`

Forbidden by default:

- raw typed characters
- raw field values
- pasted text payloads
- reconstructed textual content

## Application events

`emitAppEvent` stores the payload supplied by the application. The application must restrict these payloads to identifiers, codes and state flags and exclude personal data.
