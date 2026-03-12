import * as webllm from "https://esm.run/@mlc-ai/web-llm";

export default {
  name: "Neural Engine",
  description: "Pluto's on-device AI engine.",
  ver: "v1.7.0", // Version 1.7.0 feature
  type: "process",
  exec: async function (Root) {
    let state = {
      compatible: false,
      gpuInfo: {
        architecture: "Not supported",
        vendor: "Not supported",
      },
      status: {
        message: "Getting models",
        ready: false,
        progress: 0.0,
      },
      model: {
        selected: "Qwen3-1.7B-q4f32_1-MLC",
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
        let adapter = await navigator.gpu.requestAdapter();
        state.compatible = true;
        state.status = { message: "Disabled" };
        state.gpuInfo.vendor = adapter.info.vendor;
        state.gpuInfo.architecture = adapter.info.architecture;
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
        state.status.progress = report.progress;
        if (report.text.includes("Finish loading")) {
          state.status.ready = true;
        }
        document.dispatchEvent(
          new CustomEvent("Pluto.NeuralEngine.StatusUpdate", {
            detail: state.status.message,
          }),
        );
        // console.log("status", state);
      });
      await engine.reload(state.model.selected, state.model.config);
    }

    async function streamResponse(messages, onUpdate, onFinish, onError) {
      try {
        let curMessage = "";
        let usage;
        const completion = await engine.chat.completions.create({
          stream: true,
          messages,
          stream_options: { include_usage: true },
        });
        for await (const chunk of completion) {
          const curDelta = chunk.choices[0]?.delta.content;
          if (curDelta) {
            curMessage += curDelta;
          }
          if (chunk.usage) {
            usage = chunk.usage;
          }
          onUpdate(curMessage);
        }
        const finalMessage = await engine.getMessage();
        onFinish(finalMessage, usage);
      } catch (err) {
        onError(err);
      }
    }

    checkWebGPUSupport();

    return {
      getState,
      getModels,
      streamResponse,
      start,
    };
  },
};
