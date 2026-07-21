export type LocalRuntimeCapability = {
  cpuModel: string;
  logicalCpuCount: number;
  totalMemoryGb: number;
  availableMemoryGb: number;
};

type ChromeSystemApi = {
  system: {
    cpu: {
      getInfo(): Promise<{
        modelName: string;
        numOfProcessors: number;
      }>;
    };
    memory: {
      getInfo(): Promise<{
        capacity: number;
        availableCapacity: number;
      }>;
    };
  };
};

function bytesToGb(value: number) {
  return value / (1024 ** 3);
}

function getChromeSystemApi() {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: ChromeSystemApi }).chrome;
  if (!chromeApi?.system?.cpu || !chromeApi.system.memory) {
    throw new Error("Chrome system APIs are unavailable");
  }
  return chromeApi.system;
}

export async function readLocalRuntimeCapability(): Promise<LocalRuntimeCapability> {
  const system = getChromeSystemApi();
  const [cpu, memory] = await Promise.all([
    system.cpu.getInfo(),
    system.memory.getInfo(),
  ]);

  return {
    cpuModel: cpu.modelName.trim() || "Unknown CPU",
    logicalCpuCount: cpu.numOfProcessors,
    totalMemoryGb: bytesToGb(memory.capacity),
    availableMemoryGb: bytesToGb(memory.availableCapacity),
  };
}
