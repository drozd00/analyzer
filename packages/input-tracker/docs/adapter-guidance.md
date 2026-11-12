# Adapter Guidance

An adapter connects framework components to the tracker's form and field identifiers.

## Integration

1. Attach `data-track-form-id` and `data-track-field-id` or provide resolver callbacks.
2. Register the form definition with its field identifiers and order.
3. Forward validation and submission outcomes through `emitAppEvent`.
4. Connect the application's persistence or transport layer to buffered events and exports.

## Data handling

The tracker captures and normalizes browser events, redacts ordinary character input, and buffers events for export. The host application supplies semantic event payloads and is responsible for their privacy, storage and delivery. `input-analyzer` computes metrics from the exported stream.
