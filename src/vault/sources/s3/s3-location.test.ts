import { describe, expect, it } from "vitest";
import { describeS3Location, isPrivateHost, parseS3Location } from "./s3-location.ts";

const PUBLIC = { allowPrivateEndpoints: false };

describe("parseS3Location", () => {
  it("normalises the endpoint, the region and the prefix", () => {
    const location = parseS3Location({ endpoint: " https://store.example.com/gateway ", region: "", bucket: "notes", prefix: "/Vault/Main/" }, PUBLIC);
    expect(location.ok && { endpoint: location.value.endpoint.toString(), region: location.value.region, prefix: location.value.prefix }).toEqual({
      endpoint: "https://store.example.com/gateway/",
      region: "auto",
      prefix: "Vault/Main",
    });
  });

  it.each([
    ["ftp://store.example.com", "vault.s3_endpoint_invalid"],
    ["http://store.example.com", "vault.s3_endpoint_invalid"],
    ["https://user:pass@store.example.com", "vault.s3_endpoint_invalid"],
    ["https://store.example.com/?x=1", "vault.s3_endpoint_invalid"],
    ["not a url", "vault.s3_endpoint_invalid"],
    ["https://127.0.0.1:9000", "vault.s3_endpoint_private"],
    ["https://localhost", "vault.s3_endpoint_private"],
    ["https://169.254.169.254", "vault.s3_endpoint_private"],
    ["https://[::1]", "vault.s3_endpoint_private"],
    ["https://minio.internal", "vault.s3_endpoint_private"],
  ])("refuses the endpoint %s with %s", (endpoint, code) => {
    const location = parseS3Location({ endpoint, region: "auto", bucket: "notes", prefix: "" }, PUBLIC);
    expect(!location.ok && location.error).toBe(code);
  });

  it("lets a self-hosted instance use a private http endpoint when it opts in", () => {
    const location = parseS3Location({ endpoint: "http://127.0.0.1:9000", region: "us-east-1", bucket: "notes", prefix: "" }, { allowPrivateEndpoints: true });
    expect(location.ok && location.value.endpoint.toString()).toBe("http://127.0.0.1:9000/");
  });

  it.each([
    [{ bucket: "ab" }, "vault.s3_bucket_invalid"],
    [{ bucket: "-notes" }, "vault.s3_bucket_invalid"],
    [{ bucket: "no..dots" }, "vault.s3_bucket_invalid"],
    [{ bucket: "has/slash" }, "vault.s3_bucket_invalid"],
    [{ region: "US EAST" }, "vault.s3_region_invalid"],
    [{ prefix: "Vault/../Other" }, "vault.s3_prefix_invalid"],
    [{ prefix: "Vault//Main" }, "vault.s3_prefix_invalid"],
    [{ prefix: "a".repeat(513) }, "vault.s3_prefix_invalid"],
  ])("refuses %o with %s", (field, code) => {
    const location = parseS3Location({ endpoint: "https://store.example.com", region: "auto", bucket: "notes", prefix: "", ...field }, PUBLIC);
    expect(!location.ok && location.error).toBe(code);
  });
});

describe("isPrivateHost", () => {
  it.each([
    ["10.1.2.3", true],
    ["172.16.0.1", true],
    ["172.32.0.1", false],
    ["192.168.1.10", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["[fd00::1]", true],
    ["[fe80::1]", true],
    ["[::ffff:127.0.0.1]", true],
    ["[2606:4700::1]", false],
    ["8.8.8.8", false],
    ["printer", true],
    ["nas.local", true],
    ["s3.eu-central-1.amazonaws.com", false],
  ])("%s is private: %s", (host, expected) => {
    expect(isPrivateHost(host)).toBe(expected);
  });
});

describe("describeS3Location", () => {
  it("names the bucket, the prefix and the host", () => {
    expect(describeS3Location({ endpoint: "https://store.example.com/", bucket: "notes", prefix: "Vault" })).toBe("notes/Vault (store.example.com)");
    expect(describeS3Location({ endpoint: new URL("https://store.example.com:8443/"), bucket: "notes", prefix: "" })).toBe("notes (store.example.com:8443)");
  });
});
