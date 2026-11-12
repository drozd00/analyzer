# Input tracker

Record how people interact with browser forms. The tracker captures focus, keyboard and pointer
actions, and editing metadata while leaving out typed characters and field values.

## Install

From the repository root, build and pack the library:

```sh
npm ci
npm run build:tracker
npm pack --workspace input-tracker
```

In your application, run `npm install /path/to/input-tracker-1.0.0.tgz`.

## Track a form

Give the form and fields stable IDs.

```html
<form data-track-form-id="registration">
  <label for="email">Email</label>
  <input id="email" type="email" data-track-field-id="email" />
</form>
```

Register those IDs in your application and start the tracker.

```ts
import { createInputTracker } from "input-tracker";

const tracker = createInputTracker();
tracker.registerForm({
  formId: "registration",
  fields: [{ fieldId: "email", order: 1, fieldKind: "email" }]
});
tracker.start();
```

Use `getEvents()` to read the buffered events or `flush()` to read and clear them. `exportData()`
returns events with their form definitions. Call `stop()` when the form closes. Your application
handles delivery and can add its own validation or submission events with `emitAppEvent()`. Keep
personal data out of those payloads.

See the [browser example](examples/catalog-search.html), [event schema](docs/event-schema.md), and
[privacy notes](docs/privacy.md) for details. Run `npm test --workspace input-tracker` to test the
library.
