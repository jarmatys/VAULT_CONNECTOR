// Imported first by worker.ts. workerd leaves `import.meta.url` undefined, and wrangler bundles the Worker into one ES
// module, so every module of the bundle shares that `import.meta`. The SOFTURE modules in softure.config.ts resolve
// their migrations folder from it when the config loads (only `softure migrate` reads the folder), so the scheduled
// handler's config would throw at start. OpenNext sets the same placeholder, but only on the first request.
import.meta.url ??= "file:///worker.js";
