import { EventEmitter } from 'node:events'
import type { TaskProgress } from '../../shared/types'

/**
 * 主进程内部事件总线
 * 用于 scanner / embedding worker 等模块向 IPC 层广播事件，
 * 再由 IPC 层转发给渲染进程。实现模块解耦。
 */
class MainBus extends EventEmitter {}

export const bus = new MainBus()
bus.setMaxListeners(50)

export const BusEvent = {
  TASK_PROGRESS: 'task-progress',
  IMAGE_ADDED: 'image-added',
  IMAGE_REMOVED: 'image-removed',
  IMAGE_EMBEDDED: 'image-embedded'
} as const

export function emitProgress(p: TaskProgress): void {
  bus.emit(BusEvent.TASK_PROGRESS, p)
}
