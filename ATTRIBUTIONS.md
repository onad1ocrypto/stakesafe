# Attribution and data sources

- Public validator metadata: Nimiq Validators API, https://github.com/nimiq/validators-api . Current mainnet deployment: https://validators-api-main.je-cf9.workers.dev/ . StakeSafe consumes JSON; the upstream source code, validator logos, and third-party website assets are not bundled. Metadata remains attributable to its respective contributors; MIT for StakeSafe's code does not relicense third-party metadata.
- Official staking documentation: https://www.nimiq.com/staking/ . External navigation only.
- Official Nimiq Wallet: https://wallet.nimiq.com/ . The `/staking?page=validators` destination follows the public Wallet router; behavior should also be tested on supported devices before release.
- StakeSafe orbit-and-diamond identity: vector adaptation of an AI-generated concept selected for this project. No Nimiq logo is used as the app identity. Trademark clearance has not been performed.
- Inline UI icons: project-authored SVG primitives. System fonts only.
- Development tests: Playwright, https://github.com/microsoft/playwright (Apache-2.0); installed as a development dependency, not included in the static app bundle.

No affiliation or endorsement by Nimiq or any validator is implied.

- Runtime: @nimiq/mini-app-sdk 0.2.4, The Nimiq Development Team (MIT), https://github.com/nimiq/trust-web3-provider . Bundled locally; see THIRD_PARTY_NOTICES.txt.
- Mainnet records: https://rpc.nimiqwatch.com (third-party public RPC), queried through the same-origin StakeSafe gateway only after source disclosure and explicit consent.
- Development bundler: esbuild (MIT), not a runtime service.
