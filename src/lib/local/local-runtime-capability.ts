export type LocalRuntimeCapability = {
  cpuModel: string;
  logicalCpuCount: number;
  totalMemoryGb: number;
  availableMemoryGb: number;
};

function bytesToGb(value: number) {
  return value / (1024 ** 3);
}

export async function readLocalRuntimeCapability(): Promise<LocalRuntimeCapability> {
  const [cpu, memory] = await Promise.all([
    chrome.system.cpu.getInfo(),
    chrome.system.memory.getInfo(),
  ]);

  return {
    cpuModel: cpu.modelName.trim() || "Unknown CPU",
    logicalCpuCount: cpu.numOfProcessors,
    totalMemoryGb: bytesToGb(memory.capacity),
    availableMemoryGb: bytesToGb(memory.availableCapacity),
  };
}
