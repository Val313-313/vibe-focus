export function generateTaskId(num: number): string {
  return `t${num}`;
}

export function generateCriterionId(taskId: string, index: number): string {
  return `${taskId}-c${index + 1}`;
}
