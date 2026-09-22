# Changelog

## [0.2.0](https://github.com/StandarX-miralabs-tech/standarnav/compare/v0.1.0...v0.2.0) (2026-09-22)


### Features

* **auto:** a vanilla auto-mount helper on @standarx/nav/auto ([7bdca8e](https://github.com/StandarX-miralabs-tech/standarnav/commit/7bdca8e7812e067cedd9f3ac68cd331a46f8cf03))

## 0.1.0 (2026-09-22)


### Features

* answer the `<select>` question, both halves ([695db85](https://github.com/StandarX-miralabs-tech/standarnav/commit/695db8594de23ae243f1c12ff3b52f6d31bd12a1))
* **dom:** the four DOM helpers the engine needs ([df7229a](https://github.com/StandarX-miralabs-tech/standarnav/commit/df7229a0d68e6e8af9e761bbbb903015891c3d43))
* **engage:** the shared engage-mode scope ([7638b6c](https://github.com/StandarX-miralabs-tech/standarnav/commit/7638b6c2f4c8ed5dd17c55b4d1f905fd94ff0300))
* extract the spatial navigation engine into standarnav v0 ([4bef558](https://github.com/StandarX-miralabs-tech/standarnav/commit/4bef558bffa8446a2641168949ee96bd7fcecc06))
* **focus-ring:** the animated overlay, and the paint it lost ([71dc53c](https://github.com/StandarX-miralabs-tech/standarnav/commit/71dc53c81ef371805723e990fbc5dcd5a0c91f2c))
* **gamepad:** dead zone, mapping and repeat ([c58859d](https://github.com/StandarX-miralabs-tech/standarnav/commit/c58859d2de4a5b9a4d4a470e98614b04b590fb09))
* **gamepad:** the polling engine ([b326ef8](https://github.com/StandarX-miralabs-tech/standarnav/commit/b326ef854fe7db8e4c2a6f83d591931171a0b41d))
* **index:** the root entry, the debug subpath and a size script that measures ([f29bf92](https://github.com/StandarX-miralabs-tech/standarnav/commit/f29bf926710940df996bcfd93662e91519d5f8f5))
* **input-system:** the one-per-application facade ([20d6849](https://github.com/StandarX-miralabs-tech/standarnav/commit/20d6849fe0be8619921128e5703e4d53f84cbbb2))
* **intent-bus:** the LIFO scope stack ([c856098](https://github.com/StandarX-miralabs-tech/standarnav/commit/c856098781094631746cb01d00fd4614b5576add))
* **keyboard:** a preview row that shows the text and moves the caret ([e758665](https://github.com/StandarX-miralabs-tech/standarnav/commit/e7586657fccfa6ad07651c44bb98901dbf85df82))
* **keyboard:** the on-screen keyboard, and three defects its own tests found ([996f1f4](https://github.com/StandarX-miralabs-tech/standarnav/commit/996f1f4dfb87c7e2bdded0cfb486ff7f7f5648e8))
* **keymap:** key and remote-code resolution ([c0801f0](https://github.com/StandarX-miralabs-tech/standarnav/commit/c0801f0514269c900ff29dd4ccb59088591d6991))
* **modality:** the per-document modality tracker ([75d9830](https://github.com/StandarX-miralabs-tech/standarnav/commit/75d98304a01d177079fe1bd7796bedd03b75f270))
* **playground:** a device panel, and the pad can drive a cursor ([c978140](https://github.com/StandarX-miralabs-tech/standarnav/commit/c9781401255738a6bb7afa26cc69f079056a3a74))
* **playground:** the four controls that hold a value, and a test that drives them ([7c6870e](https://github.com/StandarX-miralabs-tech/standarnav/commit/7c6870e7023f6558e81b1be23584796f0da0b3b0))
* **playground:** the native select works, and Backspace lets go ([2a9fddd](https://github.com/StandarX-miralabs-tech/standarnav/commit/2a9fddd6ffa71a4975bbe72893255471f8ff812f))
* **playground:** wire the engine, and stack chrome over it on purpose ([0df4edc](https://github.com/StandarX-miralabs-tech/standarnav/commit/0df4edc00bc7a9605eb272e2ff4c51649003931f))
* **react:** the provider, the hooks and the document seam ([4e3a066](https://github.com/StandarX-miralabs-tech/standarnav/commit/4e3a066fe02a0df498b0470c3bfa858bba10c836))
* **release:** wire release-please, and correct the one sentence that would not have worked ([1d569f0](https://github.com/StandarX-miralabs-tech/standarnav/commit/1d569f0a930bc185bc2ec08c6a4bed73b091e90b))
* **scripts:** the citation gate reads the bare anchors too ([44a44e8](https://github.com/StandarX-miralabs-tech/standarnav/commit/44a44e8bd2037caaf9f6b1689b594bcc576e5695))
* **spatial:** discard a candidate with either dimension at zero (ADR-0009 C1) ([9f2f8cc](https://github.com/StandarX-miralabs-tech/standarnav/commit/9f2f8cc532aa2d58a28dc4303324bece9fd4c2ab))
* **spatial:** geometry, the declarative attributes, and no benchmark ([2f1eed6](https://github.com/StandarX-miralabs-tech/standarnav/commit/2f1eed67dc958c037772cbf3a5c0ef102004d87d))
* **spatial:** the navigation engine, with the WeakRef fallback ([f9279b4](https://github.com/StandarX-miralabs-tech/standarnav/commit/f9279b473eb1bf7b06467ba50f3e48d089ccc2de))
* **tabbable:** who can take focus, and the .at(-1) rewrite ([ce1ccc7](https://github.com/StandarX-miralabs-tech/standarnav/commit/ce1ccc7f0dd07b18e39d5cf2347ecef8f6161cb8))
* **types:** the intent vocabulary ([e1c2512](https://github.com/StandarX-miralabs-tech/standarnav/commit/e1c2512fe0b7819c4b60f25d4c2b24bda25a7374))


### Bug Fixes

* **docs:** "the source" named three different things ([e0ede21](https://github.com/StandarX-miralabs-tech/standarnav/commit/e0ede218929f4bf3b5834674ed7d7bf7debd33d2))
* **docs:** ADR-0010 still described a debug module from before the scan shipped ([36993de](https://github.com/StandarX-miralabs-tech/standarnav/commit/36993de73b83c81e67bcaaab49e177ef8238a35f))
* **docs:** forty-two claims the tree no longer supported ([4de1a73](https://github.com/StandarX-miralabs-tech/standarnav/commit/4de1a737b9af20089886024165337ec906e1e07c))
* **docs:** the index still advertised six subpaths ([064aaa2](https://github.com/StandarX-miralabs-tech/standarnav/commit/064aaa2db5a6386bc58a95c3263a1407920e71d6))
* **docs:** twenty anchors that resolve to a real line and the wrong one ([5015e88](https://github.com/StandarX-miralabs-tech/standarnav/commit/5015e8830aeca144a7077aa9d42b8df33f0ef049))
* **focus-ring:** the z-index and the fade that left with the stylesheet ([92a5f89](https://github.com/StandarX-miralabs-tech/standarnav/commit/92a5f8909083b264f16764267c7bf79a993d8341))
* **gamepad:** a runtime with no pads must not take the input system down ([de0aa7a](https://github.com/StandarX-miralabs-tech/standarnav/commit/de0aa7af1a5b79c919632c45b1ff9af79cc5cbd4))
* **gamepad:** export the types the plugin's own signatures name ([37a7c18](https://github.com/StandarX-miralabs-tech/standarnav/commit/37a7c1830968971aa88578b8941af7c0bdcee661))
* **input-system:** unwind a plugin setup that throws, and finish a teardown ([acd508d](https://github.com/StandarX-miralabs-tech/standarnav/commit/acd508da8c332e9638067b1843adb18faad96786))
* **keyboard:** a focus is not a decision — the keyboard stops opening on hover ([ff4b0e0](https://github.com/StandarX-miralabs-tech/standarnav/commit/ff4b0e036ff218ffcbe91fdaa6913fc245172819))
* **playground:** a dropdown has to drop something down ([7a7035e](https://github.com/StandarX-miralabs-tech/standarnav/commit/7a7035ebe1341f07e0d5e09edbdfae6d941ead01))
* **playground:** the closed listbox was never closed ([1f28d5c](https://github.com/StandarX-miralabs-tech/standarnav/commit/1f28d5cd85bcb7aa742dfcae33795cd16b1af2df))
* **playground:** the pad cursor destroyed every intent it did not use ([39f9608](https://github.com/StandarX-miralabs-tech/standarnav/commit/39f9608eac2af8938907bdb0a0f791c948e825af))
* **playground:** the text field was a dead end ([b8b35f6](https://github.com/StandarX-miralabs-tech/standarnav/commit/b8b35f6ff04d004708f53fd4d8955e89e96204cb))
* **react:** state what useStableList actually protects, and pin both halves ([f159691](https://github.com/StandarX-miralabs-tech/standarnav/commit/f159691e9dbbfdfb08c4fb715b3c8f954e873e7b))
* **react:** stop rebuilding the input system on a parent render ([a8e096d](https://github.com/StandarX-miralabs-tech/standarnav/commit/a8e096dc9e521dfc49e80cc71d82e5f8c9a79bb7))
* **scripts:** the whole-package line measures the whole package ([bdae873](https://github.com/StandarX-miralabs-tech/standarnav/commit/bdae87361181e86f36f9a61518bb1e59dd0e28ab))
* **spatial:** release the focus memory, and the frame a teardown left flying ([98dc1f3](https://github.com/StandarX-miralabs-tech/standarnav/commit/98dc1f312d45f78674136209b6ba1f10377ef357))
