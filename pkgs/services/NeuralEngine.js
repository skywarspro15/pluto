import * as webllm from "https://esm.run/@mlc-ai/web-llm";

export default {
  name: "Neural Engine",
  description: "Pluto's on-device AI engine.",
  ver: "v1.7.0", // Version 1.7.0 version
  type: "process",
  exec: async function (Root) {
    let state = {
      compatible: false,
      status: {
        message: "Getting models",
      },
      model: {
        selected: "Llama-3.2-1B-Instruct-q4f32_1-MLC",
        config: {
          temperature: 1.0,
          top_p: 1,
        },
      },
    };

    const availableModels = webllm.prebuiltAppConfig.model_list.map(
      (m) => m.model_id,
    );

    let engine;

    async function getState() {
      return state;
    }

    async function checkWebGPUSupport() {
      let hasSupport = false;
      try {
        if (typeof webllm.isWebGPUSupported === "function") {
          hasSupport = await webllm.isWebGPUSupported();
        } else if (typeof navigator !== "undefined" && navigator.gpu) {
          hasSupport = true;
        }
      } catch (e) {
        // ignore errors, assume false
        hasSupport = false;
      }
      if (!hasSupport) {
        state.compatible = false;
        state.status = { message: "WebGPU is not supported", error: true };
      } else {
        state.compatible = true;
        state.status = { message: "WebGPU supported" };
      }
      console.log("User supports webgpu?", hasSupport);
      return hasSupport;
    }

    async function getModels() {
      return availableModels;
    }

    async function start() {
      const ok = await checkWebGPUSupport();
      if (!ok) {
        // throw so callers know startup failed
        throw new Error("WebGPU is not supported on this device");
      }
      console.log("Starting AI engine...");
      engine = new webllm.MLCEngine();
      engine.setInitProgressCallback((report) => {
        state.status.message = report.text;
        document.dispatchEvent(
          new CustomEvent("Pluto.NeuralEngine.StatusUpdate"),
        );
        // console.log("status", state);
      });
      await engine.reload(state.model.selected, state.model.config);
    }

    checkWebGPUSupport();

    return {
      getState,
      getModels,
      start,
    };
  },
};
