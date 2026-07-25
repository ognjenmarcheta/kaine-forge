import { describe, expect, it } from "vitest";

// @boundaries-ignore tooling/dev-mobile-lan.ts is a loose root script, not a workspace, so it
// has nowhere else to be tested from. Give it a home workspace to remove this exception.
import { buildMobileLanDevConfig, selectLanIpv4Address } from "../../tooling/dev-mobile-lan";

describe("mobile LAN dev helper", () => {
  it("builds API and Expo URLs from the detected LAN address", () => {
    expect(buildMobileLanDevConfig({ lanIp: "192.168.1.42" })).toEqual({
      apiHost: "0.0.0.0",
      apiPort: 4000,
      apiUrl: "http://192.168.1.42:4000",
      graphqlUrl: "http://192.168.1.42:4000/graphql"
    });
  });

  it("selects the first non-internal IPv4 address", () => {
    expect(
      selectLanIpv4Address({
        lo0: [
          {
            address: "127.0.0.1",
            cidr: "127.0.0.1/8",
            family: "IPv4",
            internal: true,
            mac: "00:00:00:00:00:00",
            netmask: "255.0.0.0"
          }
        ],
        en0: [
          {
            address: "fe80::1",
            cidr: "fe80::1/64",
            family: "IPv6",
            internal: false,
            mac: "00:00:00:00:00:01",
            netmask: "ffff:ffff:ffff:ffff::",
            scopeid: 1
          },
          {
            address: "192.168.1.42",
            cidr: "192.168.1.42/24",
            family: "IPv4",
            internal: false,
            mac: "00:00:00:00:00:02",
            netmask: "255.255.255.0"
          }
        ]
      })
    ).toBe("192.168.1.42");
  });
});
