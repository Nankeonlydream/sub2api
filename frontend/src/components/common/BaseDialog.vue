<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        :class="['modal-overlay', { 'modal-overlay--soft': appearance === 'soft' }]"
        :style="zIndexStyle"
        :aria-labelledby="dialogId"
        role="dialog"
        aria-modal="true"
        @click.self="handleClose"
      >
        <!-- Modal panel -->
        <div
          ref="dialogRef"
          :class="['modal-content', widthClasses, { 'modal-content--soft': appearance === 'soft' }]"
          @click.stop
        >
          <!-- Header -->
          <div class="modal-header">
            <h3 :id="dialogId" class="modal-title">
              {{ title }}
            </h3>
            <button
              v-if="showCloseButton"
              @click="emit('close')"
              class="-mr-2 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-2 dark:text-dark-500 dark:hover:bg-dark-700 dark:hover:text-dark-300 dark:focus-visible:ring-offset-dark-900"
              aria-label="Close modal"
            >
              <Icon name="x" size="md" />
            </button>
          </div>

          <!-- Body -->
          <div ref="modalBodyRef" class="modal-body">
            <slot></slot>
          </div>

          <!-- Footer -->
          <div v-if="$slots.footer" class="modal-footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, watch, onMounted, onUnmounted, ref, nextTick } from 'vue'
import Icon from '@/components/icons/Icon.vue'

// 生成唯一ID以避免多个对话框时ID冲突
let dialogIdCounter = 0
const dialogId = `modal-title-${++dialogIdCounter}`

// 焦点管理
const dialogRef = ref<HTMLElement | null>(null)
const modalBodyRef = ref<HTMLElement | null>(null)
let previousActiveElement: HTMLElement | null = null

type DialogWidth = 'narrow' | 'normal' | 'wide' | 'extra-wide' | 'full'
type DialogAppearance = 'default' | 'soft'

interface Props {
  show: boolean
  title: string
  width?: DialogWidth
  appearance?: DialogAppearance
  closeOnEscape?: boolean
  closeOnClickOutside?: boolean
  showCloseButton?: boolean
  zIndex?: number
}

interface Emits {
  (e: 'close'): void
}

const props = withDefaults(defineProps<Props>(), {
  width: 'normal',
  appearance: 'default',
  closeOnEscape: true,
  closeOnClickOutside: false,
  showCloseButton: true,
  zIndex: 50
})

const emit = defineEmits<Emits>()

// Custom z-index style (overrides the default z-50 from CSS)
const zIndexStyle = computed(() => {
  return props.zIndex !== 50 ? { zIndex: props.zIndex } : undefined
})

const widthClasses = computed(() => {
  // Width guidance: narrow=confirm/short prompts, normal=standard forms,
  // wide=multi-section forms or rich content, extra-wide=analytics/tables,
  // full=full-screen or very dense layouts.
  const widths: Record<DialogWidth, string> = {
    narrow: 'max-w-md',
    normal: 'max-w-lg',
    wide: 'w-full sm:max-w-2xl md:max-w-3xl lg:max-w-4xl',
    'extra-wide': 'w-full sm:max-w-3xl md:max-w-4xl lg:max-w-5xl xl:max-w-6xl',
    full: 'w-full sm:max-w-4xl md:max-w-5xl lg:max-w-6xl xl:max-w-7xl'
  }
  return widths[props.width]
})

const handleClose = () => {
  if (props.closeOnClickOutside) {
    emit('close')
  }
}

const handleEscape = (event: KeyboardEvent) => {
  if (props.show && props.closeOnEscape && event.key === 'Escape') {
    emit('close')
  }
}

// Prevent body scroll when modal is open and manage focus
watch(
  () => props.show,
  async (isOpen) => {
    if (isOpen) {
      // 保存当前焦点元素
      previousActiveElement = document.activeElement as HTMLElement
      // 使用CSS类而不是直接操作style,更易于管理多个对话框
      document.body.classList.add('modal-open')

      // 等待DOM更新后设置焦点到对话框
      await nextTick()
      if (modalBodyRef.value) {
        modalBodyRef.value.scrollTop = 0
      }
      if (dialogRef.value) {
        const firstFocusable = dialogRef.value.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        firstFocusable?.focus()
      }
    } else {
      document.body.classList.remove('modal-open')
      // 恢复之前的焦点
      if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
        previousActiveElement.focus()
      }
      previousActiveElement = null
    }
  },
  { immediate: true }
)

onMounted(() => {
  document.addEventListener('keydown', handleEscape)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscape)
  // 确保组件卸载时移除滚动锁定
  document.body.classList.remove('modal-open')
})
</script>

<style scoped>
.modal-overlay--soft {
  padding: 24px;
  background: rgb(20 29 38 / 48%);
  backdrop-filter: blur(18px) saturate(82%);
  -webkit-backdrop-filter: blur(18px) saturate(82%);
}

.modal-content--soft {
  width: min(680px, calc(100vw - 48px));
  max-width: 680px;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 72%);
  border-radius: 28px;
  box-shadow: 0 30px 80px rgb(15 23 42 / 30%), 0 8px 24px rgb(15 23 42 / 12%);
}

.modal-content--soft .modal-header {
  padding: 22px 26px 16px;
  border-bottom: 0;
}

.modal-content--soft .modal-title {
  font-size: 20px;
  font-weight: 750;
}

.modal-content--soft .modal-body {
  padding: 0 26px 20px;
}

.modal-content--soft .modal-footer {
  gap: 14px;
  padding: 0 26px 24px;
  border-top: 0;
}

@media (max-width: 640px) {
  .modal-overlay--soft {
    padding: 12px;
  }

  .modal-content--soft {
    width: calc(100vw - 24px);
    border-radius: 22px;
  }

  .modal-content--soft .modal-header {
    padding: 18px 18px 14px;
  }

  .modal-content--soft .modal-body {
    padding: 0 18px 16px;
  }

  .modal-content--soft .modal-footer {
    padding: 0 18px 18px;
  }
}
</style>
