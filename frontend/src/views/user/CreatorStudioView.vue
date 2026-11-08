<template>
  <AppLayout>
    <section ref="studioElement" class="creator-studio card" aria-label="创作中心">
    <header ref="toolbarElement" class="studio-toolbar" :class="{ 'is-stuck': toolbarStuck }">
      <div class="studio-title">
        <span class="studio-title-icon"><Icon name="sparkles" size="sm" /></span>
        <span>创作中心</span>
        <button
          v-if="historyCollapsed"
          type="button"
          class="history-reopen playground-history-reopen-button"
          title="展开历史记录"
          aria-label="展开历史记录"
          aria-controls="creator-history-panel"
          :aria-expanded="!historyCollapsed"
          @click="historyCollapsed = false"
        >
          <span class="history-entry-surface">
            <span class="history-entry-icon playground-history-reopen-icon"><Icon name="inbox" size="sm" :stroke-width="1.7" /></span>
            <span class="history-entry-copy"><small>HISTORY</small><strong>历史记录</strong></span>
          </span>
        </button>
      </div>

      <div class="mode-switch" role="tablist" aria-label="创作类型">
        <button
          type="button"
          class="mode-option mode-option-image"
          :class="{ active: studioMode === 'image' }"
          role="tab"
          :aria-selected="studioMode === 'image'"
          @click="switchMode('image')"
        >
          <span class="mode-option-icon"><Icon name="grid" size="sm" :stroke-width="1.7" /></span>
          <span class="mode-option-copy"><small>IMAGE</small><strong>图片创作</strong></span>
        </button>
        <button
          type="button"
          class="mode-option mode-option-video"
          :class="{ active: studioMode === 'video' }"
          role="tab"
          :aria-selected="studioMode === 'video'"
          @click="switchMode('video')"
        >
          <span class="mode-option-icon"><Icon name="playOutline" size="sm" :stroke-width="1.7" /></span>
          <span class="mode-option-copy"><small>VIDEO</small><strong>视频工作台</strong></span>
        </button>
      </div>

      <div class="toolbar-actions">
        <span class="ready-status"><i></i>{{ activeGenerations.size ? `${activeGenerations.size} 个生成中` : '已就绪' }}</span>
        <button type="button" class="connection-action" title="刷新工作台状态" aria-label="刷新工作台状态" :disabled="bootstrapping" @click="refreshStudio">
          <Icon name="broadcast" size="sm" :class="{ pulsing: bootstrapping }" />
        </button>
        <button
          ref="historyToggleElement"
          type="button"
          class="history-drawer-toggle"
          title="作品历史"
          :aria-label="`打开作品历史${activeGenerations.size ? `，${activeGenerations.size} 个生成中` : ''}`"
          aria-controls="creator-history-panel"
          :aria-expanded="historyDrawerOpen"
          @click="historyDrawerOpen = true"
        >
          <span class="history-entry-surface">
            <span class="history-entry-icon">
              <Icon name="inbox" size="sm" :stroke-width="1.7" />
              <span v-if="activeGenerations.size" class="history-drawer-toggle-live" aria-hidden="true"></span>
            </span>
            <span class="history-entry-copy"><small>HISTORY</small><strong class="history-drawer-toggle-label">历史记录</strong></span>
          </span>
        </button>
      </div>
    </header>

    <p v-if="localSaveWarning" class="local-save-warning" role="alert">
      {{ localSaveWarning }}
      <button v-if="selectedWork?.type === 'image'" type="button" @click="retryLocalImageSave">重试保存原图</button>
    </p>
    <div class="studio-grid" :class="{ 'history-collapsed': historyCollapsed }">
      <div
        v-if="compactHistory"
        class="history-drawer-backdrop"
        :class="{ open: historyDrawerOpen }"
        aria-hidden="true"
        @click="historyDrawerOpen = false"
      ></div>
      <!-- Below 1120px the same panel becomes a fixed drawer (bottom sheet on phones). -->
      <aside
        id="creator-history-panel"
        class="history-panel"
        :class="{ 'is-drawer': compactHistory, open: compactHistory && historyDrawerOpen, dragging: historyDragOffset > 0 }"
        :style="historyDragOffset ? { transform: `translateY(${historyDragOffset}px)` } : undefined"
        :role="compactHistory ? 'dialog' : undefined"
        :aria-modal="compactHistory ? 'true' : undefined"
        :aria-hidden="compactHistory && !historyDrawerOpen ? 'true' : undefined"
        :inert="compactHistory && !historyDrawerOpen ? true : undefined"
        aria-label="作品历史"
        @keydown.esc="historyDrawerOpen = false"
        @touchstart.passive="startHistoryDrag"
        @touchmove.passive="moveHistoryDrag"
        @touchend="endHistoryDrag"
        @touchcancel="endHistoryDrag"
      >
        <span class="history-drawer-handle" aria-hidden="true"></span>
        <div class="history-heading">
          <div>
            <h2>{{ historyFilter === 'image' ? '图片历史' : '视频历史' }}</h2>
          </div>
          <span class="history-count">{{ visibleHistory.length }}</span>
          <button
            v-if="compactHistory"
            ref="historyCloseElement"
            type="button"
            class="collapse-action"
            title="关闭作品历史"
            aria-label="关闭作品历史"
            @click="historyDrawerOpen = false"
          >
            <Icon name="x" size="sm" />
          </button>
          <button v-else type="button" class="collapse-action" title="收起作品历史" @click="historyCollapsed = true">
            <Icon name="chevronLeft" size="sm" />
          </button>
        </div>

        <div class="history-tabs">
          <button type="button" :class="{ active: historyFilter === 'image' }" @click="historyFilter = 'image'">
            <Icon name="grid" size="xs" /> 图片 {{ imageHistoryCount }}
            <span v-if="activeGenerationCounts.image" class="history-tab-generating" :title="`${activeGenerationCounts.image} 个图片生成中`">
              <span class="button-spinner"></span>{{ activeGenerationCounts.image }}
            </span>
          </button>
          <button type="button" :class="{ active: historyFilter === 'video' }" @click="historyFilter = 'video'">
            <Icon name="play" size="xs" /> 视频 {{ videoHistoryCount }}
            <span v-if="activeGenerationCounts.video" class="history-tab-generating" :title="`${activeGenerationCounts.video} 个视频生成中`">
              <span class="button-spinner"></span>{{ activeGenerationCounts.video }}
            </span>
          </button>
        </div>

        <div v-if="visibleHistory.length && !historyListHidden" ref="historyListElement" class="history-list">
          <div v-if="historyPaddingTop" :style="{ height: `${historyPaddingTop}px` }" aria-hidden="true"></div>
          <article
            v-for="work in renderedHistory"
            :key="work.id"
            class="history-item"
            :class="{ active: selectedWork?.id === work.id, generating: activeGenerations.has(work.id) }"
          >
            <button
              type="button"
              class="history-item-hitbox"
              :aria-label="`打开作品：${historyWorkTitle(work)}`"
              @click="openHistoryWork(work)"
            ></button>
            <span class="history-preview">
              <CreatorThumbnail v-if="work.type === 'image' && work.outputs[0]" :src="work.outputs[0]" :cache-key="`${work.id}:${work.updatedAt}`" />
              <CreatorVideoThumbnail
                v-else-if="work.type === 'video' && work.status === 'completed'"
                :src="work.outputs[0]"
                :video-blob="work.videoBlobs?.[0] || work.mergedVideoBlob"
                :thumbnail="work.videoThumbnail"
                :cache-key="work.id + ':' + work.updatedAt"
                @ready="saveVideoThumbnail(work, $event)"
              />
              <Icon v-else-if="!activeGenerations.has(work.id)" :name="work.type === 'image' ? 'sparkles' : 'play'" size="sm" />
              <span
                v-if="activeGenerations.has(work.id)"
                class="history-generating"
                :class="{ 'has-preview': work.type === 'image' && Boolean(work.outputs[0]) }"
                aria-hidden="true"
              >
                <span class="history-generating-ring"><Icon :name="work.type === 'image' ? 'sparkles' : 'play'" size="xs" /></span>
              </span>
              <span v-else-if="work.status === 'pending'" class="history-status pending"></span>
              <span v-else-if="work.status === 'failed'" class="history-status failed"></span>
            </span>
            <span class="history-copy">
              <strong>{{ historyWorkTitle(work) }}</strong>
              <small v-if="activeGenerations.has(work.id)" class="history-progress">{{ activeGenerations.get(work.id)?.progress || '生成中' }}</small>
              <small v-else>{{ work.type === 'video' ? videoModelLabel(work.model) : modelLabel(work.model) }} · {{ work.aspectRatio || '自动' }} · {{ work.type === 'video' ? videoResolutionTierLabel(work) : workResolutionLabel(work) }} · {{ formatHistoryTime(work.createdAt) }}</small>
            </span>
            <span class="history-item-actions">
              <button
                type="button"
                class="history-delete"
                :title="activeGenerations.has(work.id) ? '生成完成后可删除' : '删除作品'"
                aria-label="删除作品"
                :disabled="activeGenerations.has(work.id)"
                @click.stop="removeWork(work)"
              >
                <Icon name="trash" size="sm" />
              </button>
            </span>
          </article>
          <div v-if="historyPaddingBottom" :style="{ height: `${historyPaddingBottom}px` }" aria-hidden="true"></div>
        </div>

        <div v-else class="history-empty">
          <span><Icon name="inbox" size="lg" /></span>
          <strong>还没有{{ historyFilter === 'image' ? '图片' : '视频' }}作品</strong>
          <p>生成的作品会出现在这里</p>
        </div>
      </aside>

      <main ref="canvasPanelElement" class="canvas-panel">
        <div v-if="selectedGeneration && selectedWork" class="generation-state" :class="{ 'is-video': generationMode === 'video' }">
          <section class="generation-panel">
            <div class="generation-heading">
              <div class="generation-heading-copy">
                <h2><span class="generation-status-dot" aria-hidden="true"></span>{{ generationMode === 'image' ? '正在绘制你的画面' : '正在制作你的视频' }}</h2>
                <p>{{ generationProgress }}</p>
              </div>
              <button type="button" class="new-creation-link generation-new-creation" @click="newCreation">
                <Icon name="plus" size="sm" />新建创作
              </button>
            </div>
            <div class="generation-body">
              <div class="generation-brief">
                <p v-if="fullPromptText(selectedWork)" class="generation-prompt" :title="fullPromptText(selectedWork)">{{ fullPromptText(selectedWork) }}</p>
                <ul class="result-tags generation-tags">
                  <li v-for="(part, partIndex) in generationTags(selectedWork)" :key="partIndex" :title="part">{{ part }}</li>
                </ul>
              </div>
              <div class="generation-metrics">
                <!-- One segment per image, so each frame below has its own progress. -->
                <div
                  v-if="generationMode === 'image' && generationFrames.length > 1"
                  class="generation-segments"
                  role="progressbar"
                  aria-valuemin="0"
                  :aria-valuemax="generationFrames.length"
                  :aria-valuenow="selectedWork.outputs.length"
                  :aria-valuetext="`已完成 ${selectedWork.outputs.length} / ${generationFrames.length}`"
                >
                  <span
                    v-for="frame in generationFrames"
                    :key="frame.index"
                    class="generation-segment"
                    :class="`is-${frame.state}`"
                    :style="{ '--segment-delay': `${frame.index * 0.2}s` }"
                  ></span>
                </div>
                <div
                  v-else
                  class="progress-track"
                  :class="{ indeterminate: !generationHasExactProgress }"
                  role="progressbar"
                  :aria-valuenow="generationHasExactProgress ? generationPercent : undefined"
                  aria-valuemin="0"
                  aria-valuemax="100"
                >
                  <span :style="generationHasExactProgress ? { width: `${generationPercent}%` } : undefined"></span>
                </div>
                <strong v-if="generationMode === 'video' && generationPhase === 'generating' && generationHasExactProgress" class="generation-percent">{{ generationPercent }}%</strong>
                <em v-if="generationMode === 'image' && generationFrames.length > 1" class="generation-done-count">已完成 {{ selectedWork.outputs.length }} / {{ generationFrames.length }}</em>
                <span class="generation-elapsed"><Icon name="clock" size="xs" />已用时<strong>{{ generationElapsedLabel }}</strong></span>
              </div>
            </div>
          </section>
          <div class="generation-stage" :class="`is-${generationMode}`" :style="generationStageStyle">
            <span
              v-for="frame in generationFrames"
              :key="frame.index"
              class="generation-frame"
              :class="`is-${frame.state}`"
              :style="generationFrameStyle"
              :aria-hidden="frame.output ? undefined : 'true'"
            >
              <img v-if="frame.output && generationMode === 'image'" :src="frame.output" alt="" decoding="async" />
              <video v-else-if="frame.output && generationMode === 'video'" :src="frame.output" muted loop playsinline autoplay class="generation-frame-video" />
              <!-- Finished images can be previewed, saved or edited while the rest are still drawing. -->
              <template v-if="frame.output && generationMode === 'image'">
                <button type="button" class="generation-frame-open" :title="`查看第 ${frame.index + 1} 张`" :aria-label="`查看第 ${frame.index + 1} 张`" @click="openPreview(frame.output)" />
                <span class="generation-frame-actions">
                  <button
                    type="button"
                    class="generation-frame-action is-preview"
                    :title="`预览第 ${frame.index + 1} 张`"
                    :aria-label="`预览第 ${frame.index + 1} 张`"
                    @click="openPreview(frame.output)"
                  ><Icon name="eye" size="xs" /></button>
                  <button
                    type="button"
                    class="generation-frame-action generation-frame-download"
                    :title="downloadingOutputKey === `${selectedWork.id}:${frame.index}` ? '正在下载' : `下载第 ${frame.index + 1} 张`"
                    :aria-label="`下载第 ${frame.index + 1} 张`"
                    :disabled="Boolean(downloadingOutputKey)"
                    @click="downloadOutput(frame.output, selectedWork, frame.index)"
                  ><Icon name="download" size="xs" /></button>
                  <button
                    type="button"
                    class="generation-frame-action generation-frame-edit"
                    :title="referencingOutputKey === `${selectedWork.id}:${frame.index}` ? '正在准备编辑' : `编辑第 ${frame.index + 1} 张`"
                    :aria-label="`编辑第 ${frame.index + 1} 张`"
                    :disabled="Boolean(referencingOutputKey)"
                    @click="useOutputAsReference(frame.output, selectedWork, frame.index)"
                  ><Icon name="edit" size="xs" /></button>
                </span>
              </template>
              <!-- Finished videos can be previewed and downloaded while the rest are still drawing. -->
              <template v-else-if="frame.output && generationMode === 'video'">
                <button type="button" class="generation-frame-open" :title="`播放镜头 ${frame.index + 1}`" :aria-label="`播放镜头 ${frame.index + 1}`" @click="previewResult(frame.output, 'video', frame.index)" />
                <span class="generation-frame-actions">
                  <button
                    type="button"
                    class="generation-frame-action is-preview"
                    :title="`播放镜头 ${frame.index + 1}`"
                    :aria-label="`播放镜头 ${frame.index + 1}`"
                    @click="previewResult(frame.output, 'video', frame.index)"
                  ><Icon name="play" size="xs" /></button>
                  <button
                    type="button"
                    class="generation-frame-action generation-frame-download"
                    :title="downloadingOutputKey === `${selectedWork.id}:${frame.index}` ? '正在下载' : `下载镜头 ${frame.index + 1}`"
                    :aria-label="`下载镜头 ${frame.index + 1}`"
                    :disabled="Boolean(downloadingOutputKey)"
                    @click="downloadOutput(frame.output, selectedWork, frame.index)"
                  ><Icon name="download" size="xs" /></button>
                </span>
              </template>
              <span v-if="frame.state === 'failed'" class="generation-frame-failed"><Icon name="exclamationTriangle" size="sm" />未生成</span>
              <template v-else-if="frame.state === 'current'">
                <span class="generation-frame-dots" aria-hidden="true"></span>
                <span class="generation-frame-loader">
                  <span class="generation-frame-ring">
                    <Icon :name="generationMode === 'image' ? 'sparkles' : 'play'" size="sm" />
                  </span>
                </span>
              </template>
              <span v-else class="generation-frame-index">{{ frame.index + 1 }}</span>
            </span>
          </div>
        </div>

        <div v-else-if="selectedWork" class="result-workspace">
          <div class="result-heading result-heading-complete">
            <div class="result-heading-title">
              <p class="eyebrow">{{ selectedWork.status === 'pending' && !hasResultImages(selectedWork) ? '等待生成结果' : selectedWork.status === 'failed' && !hasPartialImages(selectedWork) ? '生成未完成' : '生成结果' }}</p>
              <div class="result-heading-title-line">
                <h2>{{ selectedWork.status === 'failed' && !hasPartialImages(selectedWork) ? '这次没有完成' : '本次创作' }}</h2>
                <span v-if="hasResultActions(selectedWork)" class="result-count-pill">
                  {{ isMultiShotVideo(selectedWork) && selectedWork.outputs.length ? `完整成片 + ${selectedWork.outputs.length} 段` : hasResultImages(selectedWork) && selectedWork.outputs.length < resultOutputCount(selectedWork) ? `${selectedWork.outputs.length} / ${resultOutputCount(selectedWork)} 张` : `${resultOutputCount(selectedWork)} ${selectedWork.type === 'image' ? '张' : '段'}` }}
                </span>
              </div>
            </div>
            <div class="result-heading-actions">
              <button type="button" class="icon-action danger" title="删除这条作品" aria-label="删除这条作品" @click="removeWork(selectedWork)">
                <Icon name="trash" size="sm" /><span>删除</span>
              </button>
              <button
                v-if="hasResultActions(selectedWork) && selectedWork.outputs.length"
                type="button"
                class="secondary-command download-all-command"
                :title="selectedWork.type === 'image' ? '下载本页全部图片' : '下载全部视频片段'"
                :disabled="Boolean(downloadingOutputKey)"
                @click="downloadAllOutputs(selectedWork)"
              ><Icon name="download" size="sm" /><span>{{ downloadingOutputKey === `${selectedWork.id}:all` ? '正在下载...' : '一键下载' }}</span></button>
              <button
                v-if="hasRetryActions(selectedWork)"
                type="button"
                class="secondary-command"
                :disabled="Boolean(regeneratingWorkId)"
                @click="regenerateWork(selectedWork)"
              ><Icon name="refresh" size="sm" /><span>{{ regeneratingWorkId === selectedWork.id ? '准备生成...' : '重新生成' }}</span></button>
              <button v-if="hasRetryActions(selectedWork)" type="button" class="secondary-command primary-soft" @click="continueCreating"><Icon name="plus" size="sm" /><span>新建创作</span></button>
            </div>
          </div>

          <div
            v-if="selectedWork.status === 'failed' && !hasPartialImages(selectedWork)"
            class="result-error"
            :class="{ muted: reloadingVideoInPlaceId === selectedWork.id }"
            aria-live="polite"
          >
            <template v-if="reloadingVideoInPlaceId === selectedWork.id">
              <span class="video-loading-spinner" role="status"><Icon name="refresh" size="sm" /></span>
              <strong>正在加载视频</strong>
              <p>视频已生成，正在准备播放，请稍候。</p>
            </template>
            <template v-else>
              <Icon name="exclamationTriangle" size="lg" />
              <strong>生成失败</strong>
              <p>{{ localizeSvgGenerationError(selectedWork.error || '请检查模型与参数后重试。') }}</p>
              <button
                v-if="isVideoDownloadFailure(selectedWork)"
                type="button"
                class="secondary-command primary-soft status-check-command"
                :disabled="checkingVideoHistory"
                @click="reloadVideoInPlace(selectedWork)"
              >
                <Icon name="refresh" size="xs" />
                重新加载视频
              </button>
              <button type="button" class="secondary-command" @click="reuseWork(selectedWork)">带回参数重试</button>
            </template>
          </div>

          <div v-else-if="missingOutputCount(selectedWork)" class="partial-result-notice" role="status">
            <Icon name="exclamationTriangle" size="sm" />
            <div>
              <strong v-if="selectedWork.type === 'image'">已生成 {{ selectedWork.outputs.length }} / {{ resultOutputCount(selectedWork) }} 张，{{ missingOutputCount(selectedWork) }} 张未生成</strong>
              <strong v-else>已生成 {{ selectedWork.outputs.length }} / {{ resultOutputCount(selectedWork) }} 段，{{ failedShotLabel(selectedWork) }}未生成</strong>
              <p>{{ selectedWork.type === 'image' ? '已生成的图片可以正常预览和下载。' : '已生成的镜头可以正常预览和下载，失败的镜头未计费。' }}{{ partialImageReason(selectedWork) }}</p>
            </div>
            <button type="button" class="secondary-command" @click="reuseWork(selectedWork)">带回参数重试</button>
          </div>

          <!-- Opening a finished video from history and reloading after an error share
               this one placeholder box; the player replaces it once the video arrives. -->
          <div
            v-if="selectedWork.status === 'completed' && selectedWork.type === 'video' && selectedWork.requestId && !selectedWork.outputs.length && (isLoadingSelectedVideo(selectedWork) || (selectedVideoHistoryFeedback && selectedVideoHistoryFeedback.tone === 'error'))"
            class="result-error muted"
            aria-live="polite"
          >
            <template v-if="isLoadingSelectedVideo(selectedWork)">
              <span class="video-loading-spinner" role="status"><Icon name="refresh" size="sm" /></span>
              <strong>正在加载视频</strong>
              <p>视频已生成，正在准备播放，请稍候。</p>
            </template>
            <template v-else>
              <Icon name="exclamationTriangle" size="lg" />
              <strong>视频加载失败</strong>
              <p>{{ selectedVideoHistoryFeedback?.message }}</p>
              <button
                type="button"
                class="secondary-command primary-soft status-check-command"
                :disabled="checkingVideoHistory"
                @click="reloadVideoInPlace(selectedWork)"
              >
                <Icon name="refresh" size="xs" />
                重新加载视频
              </button>
            </template>
          </div>

          <section v-if="selectedWork.status !== 'failed' && hasCompleteVideo(selectedWork)" class="complete-video-card">
            <header>
              <div>
                <p class="eyebrow">完整成片</p>
                <h3>{{ selectedWork.mergedOutput ? '所有镜头已按顺序合成' : '镜头素材已完成，等待合成完整视频' }}</h3>
                <p>{{ completeVideoDescription(selectedWork) }}</p>
              </div>
              <span>{{ selectedWork.outputs.length }} 个镜头 · {{ completedVideoDuration(selectedWork) }} 秒</span>
            </header>
            <template v-if="selectedWork.mergedOutput">
              <CreatorVideoPlayer
                class="complete-video-frame"
                :style="resultMediaStyle(selectedWork)"
                media-class="complete-video-media"
                :src="selectedWork.mergedOutput"
                @error="handleVideoPlaybackError(selectedWork)"
                @loadedmetadata="handleVideoMetadata($event, selectedWork, 0, 'complete')"
              />
              <footer>
                <div>
                  <strong>{{ videoProviderLabel(selectedWork.model) }} 视频 · 完整视频</strong>
                  <ul class="result-tags">
                    <li v-for="(part, partIndex) in completeVideoResultTags(selectedWork)" :key="partIndex" :title="part">{{ part }}</li>
                  </ul>
                </div>
                <a :href="selectedWork.mergedOutput" :download="mergedDownloadName(selectedWork)" class="secondary-command primary-soft" title="下载完整视频">
                  <Icon name="download" size="sm" /> 下载完整视频
                </a>
              </footer>
            </template>
            <div v-else class="complete-video-pending" :class="{ failed: selectedWork.mergeError }">
              <span><Icon :name="selectedWork.mergeError ? 'exclamationTriangle' : 'clock'" size="lg" /></span>
              <strong>{{ selectedWork.mergeError ? '完整视频尚未合成' : '正在合成完整视频' }}</strong>
              <p>{{ selectedWork.mergeError || '分段素材已生成，正在当前浏览器中顺序拼接。' }}</p>
              <button type="button" class="secondary-command" :disabled="composingWorkId === selectedWork.id" @click="recomposeVideo(selectedWork)">
                {{ composingWorkId === selectedWork.id ? '正在合成...' : '重新合成' }}
              </button>
            </div>
          </section>

          <div v-if="selectedWork.status !== 'failed' && hasCompleteVideo(selectedWork)" class="segment-heading">
            <div><p class="eyebrow">分段素材</p><h3>镜头素材</h3></div>
            <span>{{ selectedWork.outputs.length }} 段</span>
          </div>

          <div v-else-if="(selectedWork.status !== 'failed' || hasPartialImages(selectedWork)) && selectedWork.outputs.length" class="result-grid" :class="{ single: selectedWork.outputs.length === 1 }">
            <article v-for="(output, index) in selectedWork.outputs" :key="`${selectedWork.id}-${index}`" class="result-card">
              <span v-if="selectedWork.outputs.length > 1" class="result-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <CreatorImage
                v-if="selectedWork.type === 'image'"
                class="result-media"
                :class="{ landscape: resultIsLandscape(selectedWork, index), fitted: resultIsFitted(selectedWork, index) }"
                :style="resultMediaStyle(selectedWork, index)"
                :src="output"
                :cache-key="`${selectedWork.id}:${selectedWork.updatedAt}:${index}`"
                downscale
                :alt="`生成图片 ${index + 1}`"
                title="查看大图"
                @preview="openPreview(output)"
              />
              <CreatorVideoPlayer
                v-else
                class="video-result-frame"
                :style="resultMediaStyle(selectedWork, index)"
                media-class="result-media video result-segment-video"
                :media-style="resultMediaStyle(selectedWork, index)"
                :src="output"
                @error="handleVideoPlaybackError(selectedWork)"
                @loadedmetadata="handleVideoMetadata($event, selectedWork, index)"
              />
              <div class="result-actions">
                <div class="result-description">
                  <strong>{{ selectedWork.type === 'video' ? videoShotTitle(selectedWork, index) : selectedWork.provider }}</strong>
                  <p v-if="resultDescription(selectedWork, index)" class="result-prompt" :title="resultDescription(selectedWork, index)">{{ resultDescription(selectedWork, index) }}</p>
                </div>
                <div class="result-media-actions">
                  <button type="button" class="icon-action" :title="selectedWork.type === 'image' ? '预览作品' : '播放视频'" @click="previewResult(output, selectedWork.type, index)">
                    <Icon :name="selectedWork.type === 'image' ? 'eye' : 'play'" size="sm" />
                  </button>
                  <button
                    type="button"
                    class="icon-action"
                    :title="downloadingOutputKey === `${selectedWork.id}:${index}` ? '正在下载' : '下载作品'"
                    :disabled="Boolean(downloadingOutputKey)"
                    @click="downloadOutput(output, selectedWork, index)"
                  >
                    <Icon name="download" size="sm" />
                  </button>
                  <button
                    v-if="selectedWork.type === 'image'"
                    type="button"
                    class="icon-action"
                    :title="referencingOutputKey === `${selectedWork.id}:${index}` ? '正在准备编辑' : '编辑这张照片'"
                    aria-label="编辑这张照片"
                    :disabled="Boolean(referencingOutputKey)"
                    @click="useOutputAsReference(output, selectedWork, index)"
                  >
                    <Icon name="edit" size="sm" />
                  </button>
                  <button v-else type="button" class="icon-action" title="新建创作" @click="continueCreating">
                    <Icon name="plus" size="sm" />
                  </button>
                </div>
                <ul v-if="selectedWork.type === 'image'" class="result-tags">
                  <li v-for="(part, partIndex) in metaParts(
                    modelLabel(selectedWork.model),
                    imageAspectRatioLabel(selectedWork, index),
                    imageDimensionsLabel(selectedWork, index),
                    outputFormatLabel(output) || selectedWork.outputFormat?.toUpperCase(),
                    selectedWork.outputFormat === 'gif' && selectedWork.frameCount ? `${selectedWork.frameCount} 帧` : undefined,
                    selectedWork.referenceCount ? `${selectedWork.referenceCount} 张参考图` : undefined,
                  )" :key="partIndex" :title="part">{{ part }}</li>
                </ul>
                <ul v-else class="result-tags">
                  <li v-for="(part, partIndex) in videoResultTags(selectedWork, index)" :key="partIndex" :title="part">{{ part }}</li>
                </ul>
              </div>
            </article>
          </div>

          <div v-if="selectedWork.status !== 'failed' && hasCompleteVideo(selectedWork)" class="result-grid result-segment-grid">
            <article v-for="(output, index) in selectedWork.outputs" :key="`${selectedWork.id}-segment-${index}`" class="result-card">
              <span v-if="selectedWork.outputs.length > 1" class="result-index">{{ String(shotIndexForOutput(selectedWork, index) + 1).padStart(2, '0') }}</span>
              <CreatorVideoPlayer
                class="video-result-frame"
                :style="resultMediaStyle(selectedWork, index)"
                media-class="result-media video result-segment-video"
                :media-style="resultMediaStyle(selectedWork, index)"
                :src="output"
                @error="handleVideoPlaybackError(selectedWork)"
                @loadedmetadata="handleVideoMetadata($event, selectedWork, index)"
              />
              <div class="result-actions">
                <div class="result-description">
                  <strong>{{ videoShotTitle(selectedWork, index) }}</strong>
                  <p v-if="resultDescription(selectedWork, index)" class="result-prompt" :title="resultDescription(selectedWork, index)">{{ resultDescription(selectedWork, index) }}</p>
                </div>
                <div class="result-media-actions">
                  <button type="button" class="icon-action" title="播放镜头" @click="previewResult(output, selectedWork.type, index)"><Icon name="play" size="sm" /></button>
                  <button
                    type="button"
                    class="icon-action"
                    :title="downloadingOutputKey === `${selectedWork.id}:${index}` ? '正在下载' : '下载镜头'"
                    :disabled="Boolean(downloadingOutputKey)"
                    @click="downloadOutput(output, selectedWork, index)"
                  ><Icon name="download" size="sm" /></button>
                  <button type="button" class="icon-action" title="新建创作" @click="continueCreating"><Icon name="plus" size="sm" /></button>
                </div>
                <ul class="result-tags">
                  <li v-for="(part, partIndex) in videoResultTags(selectedWork, index)" :key="partIndex" :title="part">{{ part }}</li>
                </ul>
              </div>
            </article>
          </div>

          <div v-if="selectedWork.status === 'pending' && !selectedWork.outputs.length" class="result-error muted">
            <span v-if="checkingVideoHistory" class="video-loading-spinner" role="status"><Icon name="refresh" size="sm" /></span>
            <Icon v-else name="clock" size="lg" />
            <strong>{{ selectedWork.type === 'image' ? '正在等待图片结果' : checkingVideoHistory ? '正在同步状态' : '视频还在生成中' }}</strong>
            <p>{{ selectedWork.type === 'image' ? selectedWork.imageTaskIds?.length ? '图片任务已保存在服务器，页面刷新不影响生成。点击“刷新生成结果”继续同步进度。' : '如果任务仍在其他页面生成，请保留该页面，结果保存后会自动同步到这里。若生成页面已关闭或刷新，可以带回参数重新创作。' : checkingVideoHistory ? '正在获取最新进度，请稍候。' : '任务已保存，可随时点击下方按钮同步最新进度。' }}</p>
            <div v-if="selectedWork.type === 'image'" class="pending-image-actions">
              <button type="button" class="secondary-command primary-soft image-refresh-command" @click="refreshImageWork(selectedWork)">刷新生成结果</button>
              <button type="button" class="secondary-command" @click="reuseWork(selectedWork)">带回参数</button>
            </div>
            <button
              v-if="selectedWork.type === 'video' && selectedWork.requestId"
              type="button"
              class="secondary-command primary-soft status-check-command"
              :disabled="checkingVideoHistory"
              @click="refreshVideoWork(selectedWork)"
            >
              <Icon name="refresh" size="xs" />
              {{ checkingVideoHistory ? '同步中...' : '同步状态' }}
            </button>
            <div
              v-if="selectedVideoHistoryFeedback && !checkingVideoHistory"
              class="video-status-feedback"
              :class="`is-${selectedVideoHistoryFeedback.tone}`"
              role="status"
              aria-live="polite"
            >
              <Icon :name="selectedVideoHistoryFeedback.tone === 'error' ? 'exclamationCircle' : 'infoCircle'" size="xs" />
              <span>{{ selectedVideoHistoryFeedback.message }}</span>
            </div>
          </div>

          <section class="result-parameters" aria-label="作品参数">
            <div class="result-stat-grid">
              <article v-for="field in resultParameterFields(selectedWork)" :key="field.label" :class="{ wide: field.wide }">
                <span>{{ field.label }}</span><strong :title="field.value">{{ field.value }}</strong>
              </article>
              <article class="result-prompt-cell">
                <span>完整提示词</span>
                <p class="full-prompt" :class="{ clamped: isPromptLong(selectedWork) && !promptExpanded }">{{ fullPromptText(selectedWork) }}</p>
                <button
                  v-if="isPromptLong(selectedWork)"
                  type="button"
                  class="result-prompt-toggle"
                  :aria-expanded="promptExpanded"
                  @click="promptExpanded = !promptExpanded"
                >
                  {{ promptExpanded ? '收起' : '展开全部' }}
                  <Icon name="chevronDown" size="xs" />
                </button>
              </article>
            </div>
          </section>
        </div>

        <section v-else-if="studioMode === 'video' && professionalVideo" class="professional-workspace" aria-label="专业镜头工作区">
          <header class="sequence-header">
            <div>
              <p class="sequence-eyebrow"><i></i> PRO EDITOR · SEQUENCE</p>
              <h2>镜头序列 <span>{{ videoShots.length }} / 6</span></h2>
              <p>按时间顺序编排画面，点击镜头后在右侧编辑描述与参数</p>
            </div>
            <dl>
              <div><dt>总时长</dt><dd>{{ formatSequenceDuration(totalShotDuration) }}</dd></div>
              <div><dt>已完成</dt><dd>0/{{ videoShots.length }}</dd></div>
            </dl>
            <button v-if="videoShots.length < 6" type="button" class="sequence-add" title="添加镜头" @click="addShot"><Icon name="plus" size="sm" /></button>
          </header>

          <div class="sequence-ruler"><span>00:00</span><i></i><span>{{ formatSequenceDuration(totalShotDuration) }}</span></div>

          <div class="sequence-track" tabindex="0">
            <article
              v-for="(shot, index) in videoShots"
              :key="shot.id"
              class="sequence-shot"
              :class="{ active: selectedShotId === shot.id }"
              tabindex="0"
              :aria-label="`选择镜头 ${index + 1}`"
              @click="selectShot(shot.id)"
              @keydown.enter.prevent="selectShot(shot.id)"
              @keydown.space.prevent="selectShot(shot.id)"
            >
              <div class="sequence-shot-index">{{ String(index + 1).padStart(2, '0') }}</div>
              <div class="sequence-shot-preview">
                <span><Icon name="playOutline" size="sm" /></span>
                <small>{{ formatSequenceDuration(shot.duration) }}</small>
              </div>
              <div class="sequence-shot-content">
                <header>
                  <strong>SHOT {{ String(index + 1).padStart(2, '0') }}</strong>
                  <span><i></i> 待生成</span>
                  <div>
                    <button type="button" title="向上移动镜头" :disabled="index === 0" @click="moveShot(index, -1)"><Icon name="chevronUp" size="sm" /></button>
                    <button type="button" title="向下移动镜头" :disabled="index === videoShots.length - 1" @click="moveShot(index, 1)"><Icon name="chevronDown" size="sm" /></button>
                    <button type="button" title="删除镜头" :disabled="videoShots.length === 1 || processingReferenceImages" @click="removeShot(index)"><Icon name="x" size="sm" /></button>
                  </div>
                </header>
                <p class="sequence-shot-prompt" :class="{ empty: !shot.prompt }">{{ shot.prompt || '在右侧描述这个镜头的画面、动作与运镜' }}</p>
                <footer>
                  <span>
                    {{ videoGenerationMethodLabelFor(shot.generationMethod) }}
                    <template v-if="shot.referenceImages.length"> · {{ shot.referenceImages.length }} 张参考图</template>
                  </span>
                  <span>{{ shot.aspectRatio }}</span>
                  <span>{{ shot.resolution }}</span>
                  <span>{{ shot.duration }} 秒</span>
                </footer>
              </div>
            </article>
            <button v-if="videoShots.length < 6" type="button" class="sequence-inline-add" @click="addShot"><Icon name="plus" size="sm" /><span>添加镜头</span></button>
          </div>

          <footer class="sequence-footer">
            <span><Icon name="broadcast" size="xs" /> 每个镜头可独立编辑、排序和重试</span>
            <strong :class="{ invalid: totalShotDuration > 60 }">最多 6 个镜头 · 总时长 {{ totalShotDuration }} / 60 秒</strong>
          </footer>
        </section>

        <div v-else class="inspiration-workspace">
          <div class="inspiration-intro">
            <span class="inspiration-mark"><Icon :name="studioMode === 'image' ? 'sparkles' : 'play'" size="lg" /></span>
            <p class="eyebrow">VORTEX {{ studioMode === 'image' ? 'ATELIER' : 'VIDEO WORKSHOP' }}</p>
            <h2>{{ studioMode === 'image' ? '从一份视觉企划开始' : '先写下第一个镜头' }}</h2>
            <p>{{ studioMode === 'image' ? '选择一份视觉方向，或直接写下你脑海里的画面。' : '用一个灵感镜头开始，再调整时长和画幅。' }}</p>
          </div>

          <article class="featured-brief">
            <div class="brief-topline">
              <span><Icon name="sparkles" size="xs" /> 精选企划</span>
              <span>{{ String(activeTemplateIndex + 1).padStart(2, '0') }} / {{ String(activeTemplates.length).padStart(2, '0') }}</span>
              <div>
                <button type="button" title="上一份企划" @click="previousTemplate"><Icon name="chevronLeft" size="sm" /></button>
                <button type="button" title="下一份企划" @click="nextTemplate"><Icon name="chevronRight" size="sm" /></button>
              </div>
            </div>
            <div class="brief-stage" :style="briefBodyHeight ? { '--brief-stage-height': `${briefBodyHeight}px` } : undefined">
              <Transition name="brief-slide" mode="out-in">
                <div ref="briefBodyElement" :key="`${studioMode}-${activeTemplateIndex}`" class="brief-body">
                  <div class="brief-summary">
                    <span>{{ activeTemplate.tag }}</span>
                    <h3>{{ activeTemplate.title }}</h3>
                    <p>{{ activeTemplate.subtitle }}</p>
                    <small>画面提案 · {{ activeTemplate.prompt.length }} 字</small>
                  </div>
                  <div class="brief-copy">
                    <small>CREATIVE BRIEF</small>
                    <p ref="briefPromptElement" :class="{ 'is-clipped': briefPromptClipped }" @scroll="updateBriefPromptClip">{{ activeTemplate.prompt }}</p>
                    <button type="button" @click="useTemplate(activeTemplate)">使用这份企划 <Icon name="arrowRight" size="sm" /></button>
                  </div>
                </div>
              </Transition>
            </div>
            <div class="brief-navigation">
              <label for="creator-brief-navigation">浏览企划</label>
              <input
                id="creator-brief-navigation"
                class="brief-range"
                type="range"
                min="1"
                :max="activeTemplates.length"
                step="1"
                :value="activeTemplateIndex + 1"
                :aria-valuetext="`第 ${activeTemplateIndex + 1} 份，共 ${activeTemplates.length} 份：${activeTemplate.title}`"
                :style="{ '--brief-progress': `${activeTemplateIndex / Math.max(1, activeTemplates.length - 1) * 100}%` }"
                @input="selectTemplate(Number(($event.target as HTMLInputElement).value) - 1)"
              />
              <span class="brief-position"><strong>{{ String(activeTemplateIndex + 1).padStart(2, '0') }}</strong><span>/ {{ activeTemplates.length }}</span></span>
            </div>
          </article>

          <div class="quick-templates">
            <span class="quick-templates-label">灵感分类 · 点击随机填入</span>
            <div class="quick-templates-list">
              <button v-for="category in activePromptCategories" :key="category.name" type="button" :title="`随机填入一条「${category.name}」提示词`" @click="useRandomCategoryPrompt(category)">
                <span><strong>{{ category.name }}</strong><small>{{ category.hint }}</small></span>
                <Icon name="refresh" size="xs" />
              </button>
            </div>
          </div>
        </div>
      </main>

      <aside ref="settingsPanelElement" class="settings-panel" aria-label="生成设置">
        <div ref="settingsScrollElement" class="settings-scroll">
          <div class="settings-heading">
            <div>
              <h2>生成能力</h2>
              <p>选择当前要使用的模型</p>
            </div>
            <Icon name="key" size="sm" />
          </div>

          <div v-if="studioMode === 'image'" class="capability-switch" role="tablist" aria-label="图片生成能力">
            <button
              v-for="capability in imageCapabilities"
              :key="capability.id"
              type="button"
              :class="{ active: imageCapability === capability.id }"
              @click="imageCapability = capability.id"
            >
              {{ capability.label }}
            </button>
          </div>

          <div v-else class="capability-switch video-capability-switch" role="tablist" aria-label="视频生成能力">
            <button
              v-for="capability in videoCapabilities"
              :key="capability.id"
              type="button"
              :class="{ active: videoCapability === capability.id }"
              :disabled="capability.disabled"
              :title="capability.disabled ? '暂未开放' : undefined"
              @click="videoCapability = capability.id"
            >
              {{ capability.label }}
            </button>
          </div>

          <div class="field-block">
            <label for="creator-group">创作分组</label>
            <select id="creator-group" v-model.number="selectedGroupId" class="studio-input" :disabled="bootstrapping || !availableGroups.length">
              <option v-if="!availableGroups.length" :value="0">暂无匹配分组</option>
              <option v-for="group in availableGroups" :key="group.id" :value="group.id">{{ group.name }}</option>
            </select>
            <small>不同分组可对应不同价格或生成规格</small>
          </div>

          <div class="field-block">
            <label for="creator-model">{{ studioMode === 'image' ? '图片模型' : '视频模型' }}</label>
            <select
              id="creator-model"
              v-model="selectedModel"
              class="studio-input model-input"
              :class="{ 'is-loading': loadingModels }"
              :disabled="loadingModels || !selectedApiKey || referenceVideoModelUnavailable"
              :aria-busy="loadingModels"
            >
              <option v-if="loadingModels && !selectableModelOptions.length" value="">正在读取可用模型...</option>
              <option v-else-if="referenceVideoModelUnavailable" value="">没有支持参考图的视频模型</option>
              <option v-else-if="!selectableModelOptions.length" value="">请先创建 Key</option>
              <option v-for="model in selectableModelOptions" :key="model" :value="model">{{ miniMaxH3Tier(model)?.optionLabel || modelLabel(model) }}</option>
            </select>
            <small v-if="selectedMiniMaxTierHint" data-testid="minimax-tier-hint">{{ selectedMiniMaxTierHint }}</small>
            <small v-if="selectedSeedanceTier" data-testid="seedance-tier-hint">{{ seedanceTierHint(selectedSeedanceTier) }}</small>
            <small v-if="referenceVideoModelUnavailable" class="model-compatibility-error">当前分组没有 Grok Imagine Video 1.5 或 MiniMax H3，无法使用参考图生视频</small>
          </div>

          <div v-if="selectedApiKey" class="key-ready">
            <Icon name="checkCircle" size="sm" />
            <div>
              <strong>{{ selectedApiKey.name }}</strong>
              <span>已绑定当前分组 · {{ maskedKey(selectedApiKey.key) }}</span>
            </div>
            <small>ID #{{ selectedApiKey.id }}</small>
          </div>

          <div v-else-if="selectedGroup" class="key-needed">
            <div class="key-needed-title">
              <span><Icon name="key" size="lg" /></span>
              <div>
                <strong>需要创建 Key</strong>
                <p>尚未创建对应 Key</p>
                <small>分组：{{ selectedGroup.name }}</small>
              </div>
            </div>
            <button type="button" :disabled="creatingKey" @click="createAndUseKey">
              <Icon name="key" size="sm" />
              {{ creatingKey ? '正在创建...' : '一键创建并使用' }}
            </button>
          </div>

          <hr />

          <section class="prompt-tool" :class="{ expanded: promptToolExpanded }" aria-label="提示词工具">
            <header>
              <span><Icon name="sparkles" size="sm" /></span>
              <div><strong>提示词工具</strong><small>{{ studioMode === 'image' ? '图片创作' : '视频创作' }} · 选择一个方向开始</small></div>
              <div class="prompt-tool-controls">
                <div v-if="promptToolExpanded" class="prompt-page-actions">
                  <button type="button" title="上一组提示词" :disabled="promptTemplatePageCount <= 1" @click="previousPromptPage"><Icon name="chevronLeft" size="xs" /></button>
                  <span>{{ promptTemplatePage + 1 }}/{{ promptTemplatePageCount }}</span>
                  <button type="button" title="下一组提示词" :disabled="promptTemplatePageCount <= 1" @click="nextPromptPage"><Icon name="chevronRight" size="xs" /></button>
                </div>
                <button
                  type="button"
                  class="prompt-toggle"
                  :aria-expanded="promptToolExpanded"
                  aria-controls="creator-prompt-templates"
                  @click="promptToolExpanded = !promptToolExpanded"
                >{{ promptToolExpanded ? '收起' : '打开模板' }}</button>
              </div>
            </header>
            <div v-if="promptToolExpanded" id="creator-prompt-templates" class="prompt-template-grid">
              <button
                v-for="template in visiblePromptTemplates"
                :key="template.title"
                type="button"
                :class="{ active: editorPrompt === template.prompt }"
                @click="useTemplate(template)"
              >
                <strong>{{ template.title }}</strong>
                <small>{{ template.tag }}</small>
              </button>
            </div>
          </section>

          <div class="field-block prompt-field">
            <div class="field-row">
              <label for="creator-prompt">{{ studioMode === 'image' ? '画面描述' : '视频描述' }}</label>
              <span><Icon name="sparkles" size="xs" /> {{ editorPrompt.length }}/{{ promptLimit }}</span>
            </div>
            <small>{{ studioMode === 'image' ? '描述主体、场景、风格和光线' : professionalVideo ? `多镜头制作 · 正在编辑镜头 ${selectedShotIndex + 1}` : '描述动作、镜头、节奏和环境' }}</small>
            <textarea
              id="creator-prompt"
              v-model="editorPrompt"
              class="studio-input prompt-input"
              :maxlength="promptLimit"
              :placeholder="promptPlaceholder"
            ></textarea>
          </div>

          <div v-if="studioMode === 'video'" class="two-column-fields video-method-fields">
            <div class="field-block">
              <label for="video-generation-method">生成方式</label>
              <select id="video-generation-method" v-model="activeVideoGenerationMethod" class="studio-input" :disabled="processingReferenceImages">
                <option value="text" :disabled="relayTierRequiresReference">文生视频 · 只用提示词{{ relayTierRequiresReference ? '（该模型需要参考图）' : '' }}</option>
                <option value="image" :disabled="selectedVideoRelayTier !== null">图生视频 · 1 张源图{{ selectedVideoRelayTier ? `（${videoProviderLabel(selectedModel)} 不支持）` : '' }}</option>
                <option value="reference" :disabled="!relayTierAcceptsUploads">参考图生视频 · 最多 {{ referenceVideoImageLimit }} 张{{ relayTierAcceptsUploads ? '' : '（该模型不支持上传）' }}</option>
              </select>
            </div>
            <div class="field-block">
              <label for="video-params">视频参数</label>
              <button
                id="video-params"
                type="button"
                class="studio-input image-size-trigger"
                aria-haspopup="dialog"
                :data-ratio="activeVideoAspectRatio"
                :data-resolution="activeVideoResolution"
                @click="openVideoParamsDialog"
              >
                <span>{{ videoAspectFollowsSource ? '跟随原图' : activeVideoAspectRatio }} · {{ activeVideoResolution }}</span>
                <Icon name="chevronDown" size="sm" />
              </button>
            </div>
          </div>

          <div v-if="referenceFieldVisible" class="field-block reference-field">
            <div class="field-row">
              <div><label>{{ referenceFieldLabel }}</label><small>{{ referenceHint }}</small></div>
              <button type="button" class="inline-command" :disabled="processingReferenceImages" @click="openFilePicker"><Icon name="upload" size="sm" /> 添加</button>
            </div>
            <input ref="fileInput" type="file" class="sr-only" accept="image/png,image/jpeg,image/webp,image/gif" :multiple="maxReferenceImages > 1" :disabled="processingReferenceImages" @change="handleFileInput" />
            <button
              type="button"
              class="upload-zone"
              :class="{ dragging: isDragging }"
              :disabled="processingReferenceImages"
              @click="openFilePicker"
              @dragenter.prevent="isDragging = true"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <Icon name="upload" size="lg" />
              <strong>{{ processingReferenceImages ? '正在优化图片...' : '拖入、粘贴或选择图片' }}</strong>
              <span>{{ referenceUploadDescription }}</span>
            </button>
            <div v-if="activeReferenceImages.length" class="reference-list">
              <div v-for="(reference, index) in activeReferenceImages" :key="reference.url" class="reference-item">
                <img :src="reference.url" :alt="`参考图 ${index + 1}`" />
                <button type="button" title="移除参考图" @click="removeReference(index)"><Icon name="x" size="xs" /></button>
              </div>
            </div>
            <p v-else-if="selectedWork?.referenceCount" class="history-reference-note">
              当时使用了 {{ selectedWork.referenceCount }} 张{{ referenceFieldLabel }}，原始上传文件未保存在历史中
            </p>
          </div>

          <template v-if="studioMode === 'image'">
            <div class="two-column-fields image-output-fields" :class="{ 'single-output-field': imageCapability !== 'image2' }">
              <div class="field-block">
                <label>输出尺寸</label>
                <button
                  id="creator-output-size"
                  type="button"
                  class="studio-input image-size-trigger"
                  aria-haspopup="dialog"
                  @click="openImageSizeDialog"
                >
                  <span>{{ imageSizeTriggerLabel }}</span>
                  <Icon name="chevronDown" size="sm" />
                </button>
              </div>
              <div v-if="imageCapability === 'image2'" class="field-block">
                <label for="creator-format">输出格式</label>
                <select id="creator-format" v-model="outputFormat" class="studio-input">
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WebP</option>
                  <option value="gif">GIF</option>
                  <option value="svg" :disabled="referenceImages.length > 0">SVG{{ referenceImages.length ? '（不支持参考图）' : '' }}</option>
                </select>
                <small v-if="outputFormat === 'svg'">SVG 矢量图只支持文生图，每次 1 张；画面质量用于内部参考图。</small>
              </div>
            </div>

            <div v-if="imageCapability === 'image2'" class="advanced-grid">
              <div class="field-block wide image-quality-field">
                <label for="creator-quality">画面质量</label>
                <select id="creator-quality" v-model="imageQuality" class="studio-input">
                  <option value="auto">自动</option>
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </div>
              <div v-if="outputFormat === 'gif'" class="gif-frame-fields">
                <div class="field-block">
                  <label for="creator-gif-frames">帧数</label>
                  <input id="creator-gif-frames" v-model.number="gifFrameCount" type="number" inputmode="numeric" :min="GIF_FRAME_COUNT_RANGE.min" :max="GIF_FRAME_COUNT_RANGE.max" :step="GIF_FRAME_COUNT_RANGE.step" aria-describedby="creator-gif-frames-help" class="studio-input" @change="gifFrameCount = clampGifSetting(gifFrameCount, GIF_FRAME_COUNT_RANGE)" />
                  <small id="creator-gif-frames-help">范围 {{ GIF_FRAME_COUNT_RANGE.min }}–{{ GIF_FRAME_COUNT_RANGE.max }} 帧，默认 {{ GIF_FRAME_COUNT_RANGE.fallback }} 帧。决定一轮动画包含多少张画面，不是每秒帧数（FPS）。</small>
                </div>
                <div class="field-block">
                  <label for="creator-gif-duration">每帧时长（毫秒）</label>
                  <input id="creator-gif-duration" v-model.number="gifFrameDurationMs" type="number" inputmode="numeric" :min="GIF_FRAME_DURATION_RANGE.min" :max="GIF_FRAME_DURATION_RANGE.max" :step="GIF_FRAME_DURATION_RANGE.step" aria-describedby="creator-gif-duration-help" class="studio-input" @change="gifFrameDurationMs = clampGifSetting(gifFrameDurationMs, GIF_FRAME_DURATION_RANGE)" />
                  <small id="creator-gif-duration-help">范围 {{ GIF_FRAME_DURATION_RANGE.min }}–{{ GIF_FRAME_DURATION_RANGE.max }} 毫秒（0.02–2 秒），默认 {{ GIF_FRAME_DURATION_RANGE.fallback }} 毫秒，按 {{ GIF_FRAME_DURATION_RANGE.step }} 毫秒调整。每张画面停留的时间；越小播放越快，越大播放越慢。</small>
                </div>
              </div>
            </div>

            <div class="field-block">
              <label>生成数量</label>
              <div class="stepper">
                <button type="button" title="减少数量" :disabled="outputCount <= 1" @click="outputCount--"><Icon name="minus" size="sm" /></button>
                <strong>{{ outputCount }} 张</strong>
                <button type="button" title="增加数量" :disabled="outputCount >= maxOutputCount" @click="outputCount++"><Icon name="plus" size="sm" /></button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="field-block">
              <label for="creator-video-duration">{{ professionalVideo ? `镜头 ${selectedShotIndex + 1} 时长` : '视频时长' }}</label>
              <div class="stepper video-control-row">
                <button type="button" title="减少时长" :disabled="configuredVideoDuration <= videoDurationRange.min" @click="adjustVideoDuration(-1)"><Icon name="minus" size="sm" /></button>
                <label class="stepper-value">
                  <input id="creator-video-duration" type="number" inputmode="numeric" :min="videoDurationRange.min" :max="videoDurationRange.max" step="1" :value="configuredVideoDuration" :style="{ width: `${String(configuredVideoDuration).length}ch` }" @input="fitVideoDurationInput" @change="commitVideoDurationInput" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
                  <span>秒</span>
                </label>
                <button type="button" title="增加时长" :disabled="configuredVideoDuration >= videoDurationRange.max" @click="adjustVideoDuration(1)"><Icon name="plus" size="sm" /></button>
              </div>
            </div>

            <label class="toggle-row professional-toggle video-control-row">
              <span class="professional-toggle-icon"><Icon name="grid" size="sm" /></span>
              <span class="professional-toggle-copy"><strong>{{ professionalVideo ? '收起多镜头制作' : '多镜头制作' }}</strong><small>把视频拆成几个镜头，选中后在右侧编辑</small></span>
              <span class="professional-toggle-hint" title="把视频拆成几个镜头，每个镜头可单独描述、配图、调整顺序和重新生成">拆成几个镜头，分别描述和重做</span>
              <input v-model="professionalVideo" type="checkbox" />
              <span class="professional-toggle-chevron"><Icon name="chevronDown" size="sm" /></span>
            </label>
          </template>

          <div v-if="studioMode === 'image'" class="image-cost-preview" aria-live="polite" aria-label="生成费用预估">
            <div class="image-cost-copy">
              <span class="image-cost-label">预计费用</span>
              <p>{{ imagePricingNote }}</p>
              <button v-if="imagePricingFailed" type="button" class="image-price-retry" @click="loadImagePricing">重新加载</button>
            </div>
            <div class="image-cost-total" :class="{ 'is-status': !imagePricing || imagePricing.billing_mode === 'token' }" title="已计入当前适用倍率，最终以使用记录为准">
              <strong>{{ imageEstimatedCost }}</strong>
              <span v-if="imagePricing && imagePricing.billing_mode !== 'token'">USD</span>
            </div>
          </div>

          <div v-if="studioMode === 'video'" class="video-summary">
            <div class="video-duration-estimate video-control-row" aria-label="成片时长">
              <span>成片时长 <strong class="video-duration-value">{{ estimatedVideoDuration }} 秒</strong></span>
              <small>{{ estimatedVideoMode }}</small>
            </div>
            <div class="image-cost-preview video-cost-preview" aria-live="polite" aria-label="视频生成费用预估">
              <div class="image-cost-copy">
                <span class="image-cost-label">预计费用</span>
                <p>{{ videoPricingNote }}</p>
                <button v-if="videoPricingFailed" type="button" class="image-price-retry" @click="loadVideoPricing">重新加载</button>
              </div>
              <div class="image-cost-total" :class="{ 'is-status': videoPricingLoading || videoEstimatedAmount == null }" title="已计入当前适用倍率，最终以使用记录为准">
                <strong>{{ videoEstimatedCost }}</strong>
                <span v-if="!videoPricingLoading && videoEstimatedAmount != null">USD</span>
              </div>
            </div>
          </div>

          <button type="button" class="generate-button" :disabled="!canGenerate" @click="startGeneration">
            <Icon v-if="!selectedGeneration" name="sparkles" size="sm" />
            <span v-else class="button-spinner"></span>
            {{ selectedGeneration ? '正在生成...' : '开始生成' }}
          </button>
          <p v-if="professionalVideoReferenceError" class="generation-requirement">{{ professionalVideoReferenceError }}</p>
        </div>
      </aside>
    </div>

    <div
      v-if="previewUrl"
      class="modal-backdrop image-preview"
      role="dialog"
      aria-modal="true"
      aria-label="生成图片预览"
      @click="closePreview"
    >
      <button type="button" class="preview-close" title="关闭预览（Esc）" aria-label="关闭预览" @click="closePreview"><Icon name="x" size="sm" /></button>
      <button
        v-if="previewOutputs.length > 1"
        type="button"
        class="preview-nav is-prev"
        title="上一张（←）"
        aria-label="上一张"
        @click.stop="stepPreview(-1)"
      ><Icon name="chevronLeft" size="md" /></button>
      <CreatorImage class="image-preview-content" :src="previewUrl" :cache-key="previewImageCacheKey" alt="生成图片预览" preview />
      <button
        v-if="previewOutputs.length > 1"
        type="button"
        class="preview-nav is-next"
        title="下一张（→）"
        aria-label="下一张"
        @click.stop="stepPreview(1)"
      ><Icon name="chevronRight" size="md" /></button>
      <!-- Small frames skip overlay buttons on phones, so the preview carries save and edit. -->
      <div v-if="selectedWork?.type === 'image' && previewIndex >= 0" class="preview-actions" @click.stop>
        <button
          type="button"
          class="preview-action"
          :disabled="Boolean(downloadingOutputKey)"
          @click="downloadOutput(previewUrl, selectedWork, previewIndex)"
        ><Icon name="download" size="sm" />{{ downloadingOutputKey === `${selectedWork.id}:${previewIndex}` ? '正在下载' : '下载' }}</button>
        <button
          type="button"
          class="preview-action"
          :disabled="Boolean(referencingOutputKey)"
          @click="editPreviewOutput"
        ><Icon name="edit" size="sm" />{{ referencingOutputKey === `${selectedWork.id}:${previewIndex}` ? '正在准备' : '编辑' }}</button>
      </div>
    </div>

    <BaseDialog
      :show="imageSizeDialogOpen"
      title="设置图像尺寸"
      width="normal"
      appearance="soft"
      content-class="creator-dialog"
      :close-on-click-outside="true"
      @close="imageSizeDialogOpen = false"
    >
      <div class="image-size-dialog">
        <p class="image-size-current">当前：<strong>{{ imageSizeTriggerLabel }}</strong></p>

        <div v-if="imageCapability === 'image2'" class="image-size-mode-tabs" role="tablist" aria-label="图像尺寸模式">
          <button
            v-for="mode in imageSizeModes"
            :key="mode.value"
            type="button"
            role="tab"
            :aria-selected="imageSizeDraftMode === mode.value"
            :class="{ active: imageSizeDraftMode === mode.value }"
            @click="imageSizeDraftMode = mode.value"
          >{{ mode.label }}</button>
        </div>

        <div v-if="imageSizeDraftMode === 'auto'" class="image-size-auto-panel">
          <span><Icon name="sparkles" size="lg" /></span>
          <strong>自动尺寸</strong>
          <p>由模型根据画面内容选择输出尺寸</p>
        </div>

        <template v-else-if="imageSizeDraftMode === 'ratio'">
          <section class="image-size-section">
            <h4>基准分辨率</h4>
            <div class="image-resolution-grid" :style="{ gridTemplateColumns: 'repeat(' + imageResolutionOptions.length + ', minmax(0, 1fr))' }">
              <button
                v-for="resolution in imageResolutionOptions"
                :key="resolution"
                type="button"
                :class="{ active: imageSizeDraftResolution === resolution }"
                @click="imageSizeDraftResolution = resolution"
              ><span>{{ resolution }}</span><small class="image-tier-price">{{ imageTierPriceLabel(resolution) }}</small></button>
            </div>
          </section>

          <section class="image-size-section">
            <h4>图像比例</h4>
            <div class="image-ratio-grid">
              <button
                v-for="option in imageDialogRatioOptions"
                :key="option.value"
                type="button"
                :class="{ active: imageSizeDraftRatio === option.value }"
                :disabled="!isImageRatioAvailable(imageSizeDraftResolution, option.value)"
                :title="isImageRatioAvailable(imageSizeDraftResolution, option.value) ? undefined : '此比例请选择 2K 或 4K'"
                @click="imageSizeDraftRatio = option.value"
              >
                <i :style="ratioShapeStyle(option.value)"></i>
                <span>{{ option.value === 'auto' ? '自动比例' : option.value }}</span>
              </button>
            </div>
            <p v-if="imageSizeDraftResolution === '1K'" class="image-size-tier-hint">1K 最长边不超过 1024px。16:9、9:16、21:9 为满足最小像素要求，请选择 2K 或 4K。</p>
            <button v-if="imageCapability === 'image2'" type="button" class="custom-ratio-command" @click="imageSizeDraftMode = 'custom'">自定义比例</button>
          </section>
        </template>

        <section v-else class="image-custom-size">
          <h4>输入具体像素值</h4>
          <div>
            <label>宽度<input v-model.number="imageSizeDraftWidth" type="number" min="16" max="3840" step="16" /></label>
            <span>×</span>
            <label>高度<input v-model.number="imageSizeDraftHeight" type="number" min="16" max="3840" step="16" /></label>
          </div>
          <p>宽高会自动调整为 16 的倍数，最大边 3840px，宽高比不超过 3:1，总像素范围为 655360 - 8294400。</p>
        </section>

        <div class="image-size-result">
          <span>将使用</span>
          <strong>{{ imageSizeDraftResult.replace('x', '×') }}</strong>
        </div>
      </div>

      <template #footer>
        <button type="button" class="image-size-cancel" @click="imageSizeDialogOpen = false">取消</button>
        <button type="button" class="image-size-confirm" @click="confirmImageSize">确定</button>
      </template>
    </BaseDialog>

    <BaseDialog
      :show="videoParamsDialogOpen"
      title="设置视频参数"
      width="normal"
      appearance="soft"
      content-class="creator-dialog"
      :close-on-click-outside="true"
      @close="videoParamsDialogOpen = false"
    >
      <div class="image-size-dialog video-params-dialog">
        <p class="image-size-current">当前：<strong>{{ videoAspectFollowsSource ? '跟随原图' : videoAspectLabel(activeVideoAspectRatio) }} · {{ activeVideoResolution }} · {{ configuredVideoDuration }} 秒</strong></p>
        <section class="image-size-section">
          <h4>清晰度</h4>
          <div class="image-resolution-grid" :style="{ gridTemplateColumns: 'repeat(' + videoResolutionOptions.length + ', minmax(0, 1fr))' }">
            <button
              v-for="resolution in videoResolutionOptions"
              :key="resolution"
              type="button"
              :data-resolution="resolution"
              :class="{ active: videoResolutionDraft === resolution }"
              @click="videoResolutionDraft = resolution"
            ><span>{{ resolution }}</span><small class="image-tier-price">{{ videoResolutionPriceLabel(resolution) }}</small></button>
          </div>
        </section>
        <section class="image-size-section">
          <h4>视频比例</h4>
          <div v-if="videoUsesSourceImage" class="image-size-mode-tabs video-aspect-source-tabs" role="tablist" aria-label="视频比例来源">
            <button
              type="button"
              role="tab"
              data-aspect-source="follow"
              :aria-selected="videoFollowSourceDraft"
              :class="{ active: videoFollowSourceDraft }"
              @click="videoFollowSourceDraft = true"
            >跟随原图</button>
            <button
              type="button"
              role="tab"
              data-aspect-source="custom"
              :aria-selected="!videoFollowSourceDraft"
              :class="{ active: !videoFollowSourceDraft }"
              @click="videoFollowSourceDraft = false"
            >自定义比例</button>
          </div>
          <p v-if="videoUsesSourceImage" class="image-size-tier-hint video-aspect-source-hint">
            {{ videoFollowSourceDraft ? '图生视频会跟随原图比例输出。' : '原图会按所选比例居中裁剪后再生成视频。' }}
          </p>
          <div class="image-ratio-grid video-ratio-grid">
            <button
              v-for="option in videoAspectChoices"
              :key="option.value"
              type="button"
              :data-ratio="option.value"
              :class="{ active: !videoAspectDraftFollowsSource && videoAspectDraft === option.value }"
              :disabled="videoAspectDraftFollowsSource || !videoAspectRatios.includes(option.value)"
              :title="videoAspectDraftFollowsSource ? '跟随原图' : videoAspectRatios.includes(option.value) ? undefined : '官方 Grok 不支持此比例'"
              @click="videoAspectDraft = option.value"
            >
              <i :style="ratioShapeStyle(option.value)"></i>
              <span>{{ option.value }}</span>
            </button>
          </div>
          <p v-if="!selectedVideoRelayTier" class="image-size-tier-hint">官方 Grok 不支持 21:9 参数。</p>
        </section>
        <div class="image-size-result video-params-result">
          <div>
            <span>将使用</span>
            <strong>{{ videoAspectDraftFollowsSource ? '跟随原图' : videoAspectLabel(videoAspectDraft) }} · {{ videoResolutionDraft }}</strong>
          </div>
          <div class="video-params-cost" title="已计入当前适用倍率，最终以使用记录为准">
            <span>{{ videoParamsCostNote }}</span>
            <strong>{{ videoParamsDraftCost }}</strong>
          </div>
        </div>
      </div>

      <template #footer>
        <button type="button" class="image-size-cancel" @click="videoParamsDialogOpen = false">取消</button>
        <button type="button" class="image-size-confirm" @click="confirmVideoParams">确定</button>
      </template>
    </BaseDialog>
    </section>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, reactive, nextTick, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { observeElementRect, useVirtualizer } from '@tanstack/vue-virtual'
import { useMediaQuery, useResizeObserver, useScrollLock } from '@vueuse/core'
import CreatorImage from '@/components/common/CreatorImage.vue'
import CreatorVideoPlayer from '@/components/common/CreatorVideoPlayer.vue'
import CreatorThumbnail from '@/components/common/CreatorThumbnail.vue'
import CreatorVideoThumbnail from '@/components/common/CreatorVideoThumbnail.vue'
import Icon from '@/components/icons/Icon.vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import { keysAPI } from '@/api/keys'
import { userGroupsAPI } from '@/api/groups'
import {
  createCreatorVideo,
  downloadCreatorImage,
  downloadCreatorVideo,
  generateCreatorImage,
  getCreatorImageTask,
  submitCreatorImageTask,
  type ImageGenerationResult,
  getCreatorImagePricing,
  getCreatorSeedanceCatalog,
  getCreatorVideoPricing,
  type CreatorVideoPricing,
  type CreatorImagePricing,
  getCreatorVideoContent,
  getCreatorVideoStatus,
  listCreatorModels,
} from '@/api/creator'
import {
  isMiniMaxH3Model,
  isMiniMaxH3StudioModel,
  MINIMAX_H3_ASPECT_RATIOS,
  MINIMAX_H3_MAX_REFERENCE_IMAGES,
  MINIMAX_H3_STUDIO_MODELS,
  miniMaxH3Tier,
} from '@/utils/miniMaxH3'
import { applySeedanceCatalog, isGrokRelayVideoModel, isSeedanceVideoModel, SEEDANCE_VIDEO_PRICE_FAMILY, seedanceCatalogModels, seedanceFallbackModels, seedanceTierHint, seedanceVideoTier, snapSeedanceSeconds } from '@/utils/seedanceVideo'
import {
  creatorHistory,
  type CreatorHistoryItem,
  type CreatorHistoryChange,
} from '@/services/creatorHistory'
import {
  MAX_VIDEO_REFERENCE_SOURCE_BYTES,
  MAX_VIDEO_REFERENCE_SOURCE_MB,
  MAX_VIDEO_REFERENCE_TOTAL_BYTES,
  MAX_VIDEO_REFERENCE_TOTAL_MB,
  optimizeVideoReferenceImage,
} from '@/services/videoReferenceImage'
import { imagePromptCategories, videoPromptCategories, type PromptCategory } from './creatorPromptCategories'
import { useAppStore } from '@/stores/app'
import type { ApiKey, Group } from '@/types'
import { formatScaled } from '@/utils/pricing'

type StudioMode = 'image' | 'video'
type ImageCapability = 'grok' | 'image2' | 'banner'
type VideoCapability = 'grok' | 'minimax' | 'seedance'
type GenerationPhase = 'submitting' | 'generating'
type ImageSizeMode = 'auto' | 'ratio' | 'custom'
type VideoGenerationMethod = 'text' | 'image' | 'reference'

const MAX_REFERENCE_IMAGE_SIZE_MB = 10
const MAX_REFERENCE_IMAGE_SIZE_BYTES = MAX_REFERENCE_IMAGE_SIZE_MB * 1024 * 1024
const VIDEO_SUBMISSION_RETRY_DELAYS_MS = [2000, 5000] as const
// A submitted task keeps rendering upstream, so a few failed status checks
// must not discard it (H3 renders for minutes and one 502 is common).
const VIDEO_STATUS_MAX_CONSECUTIVE_FAILURES = 5
// A finished video is charged once, when the upstream completes, so a broken
// download is retried against the same task and never needs a new submission.
const VIDEO_CONTENT_RETRY_DELAYS_MS = [3000, 8000] as const
const VIDEO_CONTENT_DOWNLOAD_FAILED_MESSAGE = '视频已生成，但下载时连接中断。点击“重新加载视频”即可继续获取，不会重复扣费，无需重新生成。'

class VideoContentDownloadError extends Error {}

interface PromptTemplate {
  title: string
  tag: string
  subtitle: string
  prompt: string
}

interface ReferenceImage {
  file: File
  url: string
}

interface VideoShot {
  id: string
  prompt: string
  duration: number
  generationMethod: VideoGenerationMethod
  referenceImages: ReferenceImage[]
  aspectRatio: string
  /** Image-to-video: keep the source shape, or crop it to aspectRatio. */
  followSourceAspect: boolean
  resolution: string
}

interface ImageGenerationSnapshot {
  apiKey: string
  platform: string
  capability: ImageCapability
  model: string
  prompt: string
  outputCount: number
  size: string
  quality: string
  outputFormat: string
  frameCount?: number
  frameDurationMs?: number
  background: string
  referenceFiles: File[]
  aspectRatio: string
  resolution: string
  sizeMode: ImageSizeMode
}

interface VideoGenerationSnapshot {
  apiKey: string
  model: string
  shots: Array<{
    prompt: string
    duration: number
    resolution: string
    aspectRatio: string
    followSourceAspect: boolean
    generationMethod: VideoGenerationMethod
    referenceFiles: Blob[]
  }>
}

// Progress of a multi-shot work that a refreshed page picks up again.
interface ResumedVideoShots {
  requestIds: string[]
  shotIndexes: number[]
  outputBlobs: Blob[]
  failedShots: number[]
  lastError?: unknown
}

const imageTemplates: PromptTemplate[] = [
  { title: '白底主图', tag: '电商主图', subtitle: '白底棚拍 · 可直接抠图', prompt: '一双白色网面运动鞋放在纯白无缝背景中央，鞋头朝左前方约 30 度，略高于鞋面的平视机位，50mm 镜头无畸变。顶部大柔光箱加两侧补光，亮度均匀无脏影，鞋底保留一层自然接触阴影。主体约占画面七成，边缘清晰，网面与缝线细节锐利，无品牌标志，1:1 电商主图。' },
  { title: '日照金山', tag: '风光摄影', subtitle: '长焦压缩 · 日出峰顶', prompt: '日出时分，一座雪山峰顶被第一缕阳光染成金色，山腰以下仍处在冷蓝色阴影中，山前有一层薄薄云带。200mm 长焦压缩远近距离，峰顶位于画面上三分线，冷暖对比强烈，雪面纹理清晰，真实的高原风光摄影。' },
  { title: '场景主图', tag: '电商主图', subtitle: '生活场景 · 45° 俯角', prompt: '一只奶白色陶瓷香薰蜡烛放在卧室床头柜上，烛火刚点燃，旁边放一本合上的书和一小枝干花。45 度俯角中近景，85mm 镜头浅景深，背景床品柔和虚化，暖色台灯为主光，窗外冷光做轮廓。产品居中偏下，标签面朝镜头但不含可读文字，温暖可信的家居电商场景主图。' },
  { title: '草原野花', tag: '风光摄影', subtitle: '广角前景 · 引导纵深', prompt: '夏季高山草原，前景是一片近距离的黄色和紫色野花，草地向远处缓坡延伸到连绵雪山，天空有几朵积云。16mm 广角低机位，前景花朵清晰，全景深，上午侧光，色彩清新自然，适合文旅宣传和桌面壁纸。' },
  { title: '多色 SKU', tag: '电商主图', subtitle: '并排陈列 · 色卡展示', prompt: '五只同款不锈钢保温杯并排站立，颜色依次为奶白、雾蓝、鼠尾草绿、燕麦色和炭黑，杯身高度和朝向完全一致。正面平视，长焦镜头压缩透视避免变形，浅灰渐变背景，柔光均匀，每只杯子下方有一致的柔和倒影。构图左右对称，颜色还原准确，适合电商多规格选择图。' },
  { title: '雾化海岸', tag: '风光摄影', subtitle: '慢门 · 海水雾化', prompt: '黄昏的黑色礁石海岸，海浪在礁石间往复流动，经长时间曝光形成柔和雾状水面，远处海平线上残留一抹橙粉色晚霞。低机位广角，前景礁石锐利，画面安静极简，真实的慢门海景摄影。' },
  { title: '套装组合', tag: '电商主图', subtitle: '阶梯陈列 · 主次分明', prompt: '一套护肤品组合摆在浅米色阶梯式亚克力台上：中间最高处是精华瓶，两侧较低位置放面霜罐和洁面乳，前景散落几片绿叶。正面略俯视，主品最大最清晰，副品依次退后，顶光加侧面柔光，玻璃和磨砂瓶身质感真实，无可读文字，干净的礼盒套装主图。' },
  { title: '银河地景', tag: '星空摄影', subtitle: '星空长曝光 · 地景剪影', prompt: '无光害的高原夜空，银河拱桥从地平线一侧升起横跨画面，下方是一座孤立山峰和一顶亮着暖灯的小帐篷。14mm 超广角，星点锐利不拖线，地景保留细节，深蓝夜空与暖色帐篷形成对比，星空风光摄影。' },
  { title: '防水卖点', tag: '详情页', subtitle: '微距特写 · 卖点放大', prompt: '一只深灰色双肩包的面料局部，水珠在防水涂层表面滚成圆珠不渗透，旁边一段拉链带有防水压胶条。100mm 微距，斜侧光掠过面料突出织纹，背景暗灰虚化，画面右侧留出三分之一空白用于放置卖点文案，详情页功能卖点特写。' },
  { title: '云海日出', tag: '风光摄影', subtitle: '高处俯瞰 · 层次分明', prompt: '站在山顶俯瞰翻涌的云海，几座山峰像岛屿一样露出云面，太阳刚从远处云层边缘升起，光线把云面染成金粉色。中长焦构图，山峰层层退后形成空气透视，画面上方留出天空，适合 PPT 背景和文旅海报。' },
  { title: '效果对比', tag: '详情页', subtitle: '左右分屏 · 对比构图', prompt: '左右分屏对比图：左侧普通毛巾放在水渍上，水仍残留在台面；右侧加厚棉毛巾吸走水渍，台面干燥。两侧机位、光线、台面和构图完全一致，正面俯拍，浅色大理石台面，中间一条细白分隔线，真实棉纤维纹理，详情页对比说明图，无文字。' },
  { title: '秋林顶视', tag: '航拍风光', subtitle: '无人机正顶视 · 色块构图', prompt: '无人机正顶视俯拍秋季森林，红、橙、黄、绿四种颜色的树冠交错成自然色块，一条白色小路弯曲穿过林间，路上一辆红色小车。阴天柔光让色彩饱和均匀，构图像抽象画，适合航拍风光和壁纸。' },
  { title: '结构拆解', tag: '详情页', subtitle: '爆炸视图 · 部件悬浮', prompt: '一副白色无线耳机的爆炸结构图，耳机外壳、电池、主板、喇叭单元和硅胶耳塞沿同一条斜轴依次分离悬浮，部件间距均匀，结构合理。深灰渐变背景，冷白轮廓光勾勒每个部件边缘，三分之二侧视角，精密工业渲染风格，适合详情页技术卖点展示。' },
  { title: '梯田水光', tag: '风光摄影', subtitle: '晨光反射 · 曲线层次', prompt: '春季灌水后的山区梯田，层层弯曲的田埂在水面上勾出曲线，清晨天空的粉蓝色倒映在水中，远山被薄雾半遮。中长焦斜俯视，曲线层次从前景延伸到远处，色调柔和，真实的田园风光摄影。' },
  { title: '尺寸参照', tag: '详情页', subtitle: '手持参照 · 真实比例', prompt: '一只成年人的手握住一块浅灰色迷你充电宝，充电宝厚度和手掌宽度比例真实，旁边桌面上放一张银行卡大小的白色卡片作为尺寸参照。平视近景，50mm 镜头，柔和窗光，背景干净，产品边角和接口细节清晰，用于详情页尺寸说明。' },
  { title: '沙丘线条', tag: '风光摄影', subtitle: '侧光 · 沙纹线条', prompt: '日落前的沙漠，起伏的沙丘被低角度侧光照亮，一半是金色受光面，一半是深色阴影，沙脊形成锐利的 S 形曲线，沙面布满细密风纹。长焦压缩，画面中没有人物，极简构图，适合壁纸和品牌背景。' },
  { title: '使用步骤', tag: '详情页', subtitle: '三格分镜 · 统一机位', prompt: '横向三格分镜图，展示片状面膜的使用步骤：第一格撕开包装，第二格展开面膜，第三格贴合在成年女性面部。三格使用同一机位、同一浅色背景和同一柔光，人物和产品保持一致，近景构图，格间用细白边分隔，无文字，详情页步骤图。' },
  { title: '湖面镜像', tag: '风光摄影', subtitle: '镜面倒影 · 上下对称', prompt: '无风清晨的高山冰川湖，湖面平静如镜，完整倒映出对岸雪山和云层，湖边有几块灰白岩石。水平线位于画面正中，上下对称构图，广角平视，蓝绿湖水通透，冷静清澈的风光摄影。' },
  { title: '服装平铺', tag: '服装电商', subtitle: '90° 顶视 · 平铺搭配', prompt: '一套通勤穿搭平铺在浅米色亚麻布上：白色衬衫、直筒牛仔裤、棕色皮带、乐福鞋和一只手表，衣物自然整理出轮廓，保留少量褶皱显得真实。90 度正顶视，均匀柔光无明显阴影，物品之间间距一致，四周留白，适合服装电商搭配图。' },
  { title: '极光雪原', tag: '星空摄影', subtitle: '超广角 · 夜空主体', prompt: '北极圈雪原的夜晚，绿色和淡紫色极光在天空中形成弯曲光带，倒映在结冰湖面上，湖边一间亮灯木屋。14mm 超广角，天空占画面三分之二，雪地保留细节，星点清晰，真实极光风光摄影。' },
  { title: '模特全身', tag: '服装电商', subtitle: '全身平视 · 50mm', prompt: '一位成年女模特穿燕麦色针织连衣裙站在浅灰无缝背景前，单手自然插兜，重心落在一条腿上。全身构图，机位在腰部高度平视，50mm 镜头保证身材比例不变形，头顶和脚下各留少量空间，大柔光箱主光加轮廓光，面料纹理清晰，服装电商模特图。' },
  { title: '丝绢瀑布', tag: '风光摄影', subtitle: '慢门 · 丝绢水流', prompt: '雨林中的多级瀑布，水流沿长满苔藓的岩石层层落下，在慢速快门下呈丝绢状，前景溪石上有绿色苔藓和蕨类。中景竖构图，阴天柔光没有高光溢出，绿色饱和，湿润真实的瀑布风光摄影。' },
  { title: '街拍穿搭', tag: '服装电商', subtitle: '长焦虚化 · 抓拍感', prompt: '城市街道上，一位成年男模特穿深蓝工装夹克和卡其裤向镜头方向自然行走，单手拿着咖啡。135mm 长焦，背景街景和行人被压缩并大幅虚化，人物从头到膝的中景，阴天柔光，色调干净，像真实抓拍的街拍穿搭图。' },
  { title: '竹林小径', tag: '风光摄影', subtitle: '引导线 · 纵深构图', prompt: '一条石板小径笔直穿过高大竹林，两侧竹子向上收拢形成拱形通道，阳光从竹叶缝隙洒下斑驳光点。平视中焦，小径作为引导线指向画面中心深处，绿色层次丰富，清幽宁静的东方风光摄影。' },
  { title: '鞋履低角', tag: '鞋类广告', subtitle: '贴地低机位 · 动态瞬间', prompt: '一只穿着跑鞋的脚踏入城市路面的浅水洼，水花向两侧溅起并被定格。镜头贴地低机位，24mm 广角近距离拍摄，鞋子是前景主体，背景街道和晨光虚化，侧逆光照亮水花轮廓，高速快门质感，运动鞋广告画面。' },
  { title: '樱花框景', tag: '季节风光', subtitle: '框景构图 · 前景虚化', prompt: '春季古寺庭院，前景一枝盛开的粉白樱花从画面上方垂下并轻微虚化，透过花枝看到远处木构寺庙和石灯笼。85mm 镜头浅景深，花枝形成自然框景，柔和阴天光，粉白与木色配色，季节风光摄影。' },
  { title: '腕表佩戴', tag: '配饰电商', subtitle: '手部特写 · 85mm', prompt: '一位成年男性手腕佩戴银色钢带腕表，手搭在深色木桌边缘，袖口露出浅蓝衬衫。85mm 近景特写，焦点落在表盘，背景笔记本和咖啡杯虚化，侧窗光在表镜上形成一道干净高光，表盘无品牌文字，配饰电商佩戴展示图。' },
  { title: '薰衣草田', tag: '季节风光', subtitle: '长焦压缩 · 行列节奏', prompt: '夏季薰衣草田，一行行紫色花垄笔直延伸到远处，尽头有一座石头农舍和一棵孤树，傍晚暖光斜照。长焦压缩让花垄排列更紧密，形成强烈节奏感，紫色与金色配色，适合文旅海报和壁纸。' },
  { title: '口红试色', tag: '美妆电商', subtitle: '45° 微距 · 色号展示', prompt: '四支旋出的口红斜放在浅粉色磨砂台面上，色号从豆沙、珊瑚、正红到深莓色，每支口红下方有一道同色试色涂抹痕迹。45 度俯视微距，柔光均匀，膏体光泽和细腻质地清晰，管身无文字，美妆电商色号展示图。' },
  { title: '山水晨雾', tag: '风光摄影', subtitle: '剪影层次 · 空气透视', prompt: '喀斯特山水清晨，一座座圆锥形山峰沿江层层排列，晨雾在山间流动，近处一位渔夫撑竹筏划过平静江面。长焦压缩，山峰从深到浅形成剪影层次，淡蓝灰色调，留白充足，真实的东方山水风光摄影。' },
  { title: '精华滴落', tag: '美妆广告', subtitle: '高速瞬间 · 液滴悬停', prompt: '一支玻璃滴管精华瓶悬在画面上方，一滴透明金色精华正从滴管尖端落下，下方水面泛起细小涟漪。纯净浅蓝背景，侧逆光让液滴通透发亮，微距中近景，产品位于左侧，右侧留出文案空间，高端护肤广告。' },
  { title: '城市蓝调', tag: '城市风光', subtitle: '蓝调时刻 · 天际线', prompt: '日落后的蓝调时刻，城市天际线沿江展开，摩天楼群刚刚亮起暖白灯光，江面倒映建筑灯光，天空是均匀的深蓝色。高处平视全景，水平线放平，建筑竖线不倾斜，冷暖平衡，城市宣传和官网 Banner 用图。' },
  { title: '膏体质地', tag: '美妆详情', subtitle: '俯视微距 · 抹开纹理', prompt: '一团白色乳霜被抹开在浅粉色亚克力板上，形成一道顺滑弧形涂抹痕，边缘有细腻的拉丝纹理，旁边放着开盖的面霜罐。俯视微距，柔和侧光突出膏体光泽与厚度，背景干净，真实材质，美妆详情页质地展示图。' },
  { title: '车流光轨', tag: '夜景摄影', subtitle: '长曝光 · 光轨引导', prompt: '城市夜晚的高架立交桥，车辆经过长时间曝光形成红白两色光轨，沿弯曲匝道流向远处高楼。高处俯视角度，光轨作为引导线形成动感曲线，建筑灯光清晰，画面干净无噪点，城市夜景摄影。' },
  { title: '果汁水花', tag: '饮品广告', subtitle: '高速快门 · 水花飞溅', prompt: '一瓶无标签的橙汁玻璃瓶立在画面中央，橙子切片从上方落入，瓶身周围溅起橙色果汁水花并被定格，冰块和水珠悬浮。浅橙色渐变背景，强逆光让液体通透，正面平视，主体清晰锐利，有冲击力的饮品广告主视觉。' },
  { title: '雨后倒影', tag: '城市风光', subtitle: '低机位 · 积水倒影', prompt: '雨后夜晚的老城街道，地面积水倒映出霓虹招牌和路灯暖光，一位撑伞行人走在街道远处。镜头贴近水面低机位，倒影占据画面下半部分，招牌没有可读文字，湿润质感真实，电影感城市夜景。' },
  { title: '冷萃逆光', tag: '饮品广告', subtitle: '逆光 · 冷凝水珠', prompt: '一杯冰冷萃咖啡放在木质吧台上，杯壁布满冷凝水珠，冰块层次清晰，咖啡液呈琥珀色。逆光从杯后打入让液体透亮，前方白色反光板补亮杯身，低机位平视，背景咖啡馆暖色虚化光斑，左侧留出文案区，门店饮品海报。' },
  { title: '海岛浅滩', tag: '航拍风光', subtitle: '正顶视 · 色彩渐变', prompt: '无人机正顶视俯拍热带海岛，白色沙滩弯成弧线，海水从浅滩的透明青绿渐变到深海的宝石蓝，一艘白色小船停在浅水区投下清晰影子。正午顶光，色彩通透，构图简洁，适合旅游宣传和壁纸。' },
  { title: '零食悬浮', tag: '食品广告', subtitle: '悬浮飞散 · 动感构图', prompt: '一袋无文字的薯片包装斜向立在画面中央，金黄薯片、海盐颗粒和迷迭香叶从包装周围向外飞散悬浮。鲜黄色纯色背景，硬光制造清晰投影，正面平视，构图有向外扩散的动感，薯片纹理和油光真实，零食电商主图。' },
  { title: '高山湖泊', tag: '风光摄影', subtitle: '广角前景石 · 全景深', prompt: '高山湖泊边，前景是几块被湖水打湿的圆润石头，湖水清澈见底，远处是锯齿状雪山和针叶林。16mm 广角低机位，前景石头到远山全部清晰，上午柔和侧光，蓝绿色调清透，户外品牌和文旅宣传图。' },
  { title: '菜单俯拍', tag: '餐饮菜单', subtitle: '90° 顶视 · 统一布光', prompt: '一碗红烧牛肉面放在深色木桌上，大块牛肉、青菜和葱花摆放整齐，汤面有油花，旁边放一双筷子和一小碟辣椒。90 度正顶视，碗位于画面中央，柔和顶光加一侧反光，色彩饱满但真实，适合统一风格的餐饮菜单图。' },
  { title: '胡杨逆光', tag: '季节风光', subtitle: '逆光 · 金色轮廓', prompt: '深秋戈壁中的胡杨林，金黄树冠被傍晚逆光照亮，树叶边缘呈现透亮光晕，粗糙树干形成深色剪影，地面有长长的树影。中焦平视，太阳藏在树枝后形成星芒，暖金色调，真实的秋季风光摄影。' },
  { title: '外卖封面', tag: '外卖平台', subtitle: '45° 俯角 · 饱满构图', prompt: '一份汉堡套餐摆在牛皮纸托盘上：双层牛肉汉堡、薯条和一杯冰可乐，汉堡切开露出芝士与生菜层次。45 度俯角近景，主体占满画面约八成，暖色柔光，食物有油亮光泽和热气，背景简洁，适合外卖平台店铺封面。' },
  { title: '彩色丘陵', tag: '航拍风光', subtitle: '航拍斜俯 · 色带纹理', prompt: '无人机斜俯视拍摄丹霞地貌，红、橙、黄、白色岩层在连绵丘陵上形成平行条纹，一条小路沿山脊延伸。傍晚低角度光线强调起伏和纹理，色彩饱满但真实，画面富有图形感，地理风光摄影。' },
  { title: '烘焙橱窗', tag: '餐饮门店', subtitle: '浅景深 · 前景对焦', prompt: '面包店玻璃橱窗内整齐摆放可颂、欧包和水果挞，前景一枚可颂清晰对焦，后方商品逐渐虚化。平视近景，85mm 镜头 f/1.8，暖黄店内灯光，酥皮层次和糖霜颗粒清晰，适合门店宣传和社媒图片。' },
  { title: '雾凇冬日', tag: '季节风光', subtitle: '高调 · 冷色留白', prompt: '冬日清晨的江边，岸边柳树枝条挂满洁白雾凇，江面冒出缕缕水汽，远处一座小桥若隐若现。高调曝光，大面积白色与淡蓝留白，中焦平视，冰晶细节清晰，安静纯净的冬季风光摄影，适合壁纸。' },
  { title: '促销横幅', tag: '电商 Banner', subtitle: '右侧主体 · 左侧留白', prompt: '超宽横幅构图，一台白色立式空气净化器放在画面右侧三分之一处，旁边一盆绿植，背景是明亮的浅蓝色客厅。画面左侧约一半为干净的浅色渐变空白，用于放置促销标题和按钮。平视机位，柔和自然光，产品无标志，电商首页 Banner。' },
  { title: '稻田几何', tag: '航拍风光', subtitle: '正顶视 · 几何图形', prompt: '无人机正顶视俯拍金黄稻田，田块被笔直的田埂和水渠分割成规则几何形，部分田块已收割呈浅褐色，一台收割机正在作业。侧光让稻穗纹理清晰，构图像抽象几何画，农业和乡村振兴宣传用图。' },
  { title: '新品海报', tag: '广告海报', subtitle: '中心构图 · 轮廓光', prompt: '一部无标志的深色智能手机悬浮在画面中央，机身微微倾斜，背面摄像模组朝向镜头，下方有一圈淡蓝光晕。纯黑背景，两侧窄条轮廓光勾出金属边框，顶部留出标题空间，竖版构图，科技感新品发布海报。' },
  { title: '灯塔海角', tag: '风光摄影', subtitle: '远景 · 三分构图', prompt: '海角悬崖上的一座白色灯塔，下方海浪拍打礁石溅起白色浪花，天空是风暴后裂开的云层，一道阳光照在灯塔上。中长焦远景，灯塔位于右侧三分线，灰蓝海水与金色光线，壮阔真实的海岸风光。' },
  { title: '节日礼盒', tag: '节日营销', subtitle: '礼盒堆叠 · 红金配色', prompt: '三只大小不同的红色礼盒错落堆叠在深红色背景前，烫金纹样、丝带和蝴蝶结细节清晰，周围点缀金色彩带和少量灯串光斑。正面平视，主光从左上方打下，画面上方留出标题空间，喜庆但不杂乱，节日大促主视觉。' },
  { title: '峡谷河湾', tag: '风光摄影', subtitle: '高位俯视 · 弧形河湾', prompt: '从悬崖边缘俯视一处马蹄形河湾，碧绿河水绕过红色砂岩形成完整弧线，崖壁层理清晰，河面上有一只小皮划艇。超广角高位俯视，日出侧光，河湾完整位于画面中央，地理杂志风光摄影。' },
  { title: '标题海报', tag: '广告海报', subtitle: '竖版排版 · 中文标题', prompt: '竖版夏季上新海报，画面上方居中写着中文大标题“夏日上新”，字体粗黑清晰。中部是一件浅蓝色亚麻衬衫挂在木衣架上，背景为明亮的海边日光和白墙阴影，下方保留空白区域放置价格信息。整体清爽，排版留白充足。' },
  { title: '水乡灯影', tag: '文旅宣传', subtitle: '蓝调 · 灯笼倒影', prompt: '江南古镇的蓝调时刻，白墙黑瓦沿河排列，屋檐下挂着一串串红灯笼，灯光倒映在平静河面上，一艘乌篷船从石桥下穿过。平视中景，石桥形成框景，深蓝天空与暖红灯光对比，古镇文旅宣传图。' },
  { title: '小红书封面', tag: '社媒种草', subtitle: '3:4 竖版 · 生活氛围', prompt: '3:4 竖版构图，一张整洁的居家书桌：笔记本电脑、拿铁、香薰和一盆小绿植，窗外是清晨柔光。45 度俯角，暖白色调，画面上方三分之一保持干净的浅色墙面用于放大标题，真实生活感，适合小红书种草封面。' },
  { title: '红墙落雪', tag: '文旅宣传', subtitle: '长焦 · 红白对比', prompt: '大雪中的古建筑宫墙，朱红墙面和金黄琉璃瓦顶覆着一层白雪，雪花仍在飘落，一位撑红伞的行人沿墙根走过。长焦压缩，红墙占据画面主体，人物小而清晰，红白金配色鲜明，冬季文旅宣传图。' },
  { title: '公众号头图', tag: '新媒体配图', subtitle: '2.35:1 宽幅 · 留标题区', prompt: '2.35:1 宽幅画面，会议桌上摊开的笔记本、钢笔和平板电脑，平板上显示简洁柱状图，没有可读文字。镜头从桌面低角度平视，左侧物品清晰，右侧大面积柔和虚化留作标题区，蓝灰商务色调，公众号文章头图。' },
  { title: '天空之镜', tag: '风光摄影', subtitle: '低机位 · 人物点景', prompt: '盐湖浅水面倒映出完整的天空和云朵，一位穿红色长裙的成年人站在湖中央，倒影清晰对称，地平线几乎消失。低机位广角，人物很小位于画面中心，天空蓝白通透，旅行宣传和社媒爆款风光图。' },
  { title: '开箱种草', tag: '社媒种草', subtitle: '第一视角 · 手部入镜', prompt: '第一人称视角，一双手正在打开一只白色快递纸盒，盒内露出包裹在纸屑中的浅绿色无线音箱。俯视角度，手部动作自然，窗边柔光，桌面有剪刀和撕开的胶带，真实分享感，适合社媒开箱种草配图。' },
  { title: '熔岩夜色', tag: '风光摄影', subtitle: '远景定点 · 冷暖对比', prompt: '夜晚的活火山远景，火山口喷出橙红色熔岩，熔岩沿山坡流下形成发光的河道，上方烟柱被映成暖红色，天空中星点可见。长焦远景，安全距离拍摄，深蓝夜空与炽热熔岩形成强烈冷暖对比，自然纪实摄影。' },
  { title: '探店打卡', tag: '社媒种草', subtitle: '广角 · 人物点景', prompt: '一家原木风咖啡馆的室内全景，大落地窗、长条木桌和吊灯，一位成年女性坐在窗边看向窗外作为点景人物。24mm 广角平视，竖线保持垂直，自然窗光明亮通透，人物占画面较小，展现空间氛围，适合探店打卡图。' },
  { title: '荷塘晨雾', tag: '季节风光', subtitle: '长焦 · 浅景深', prompt: '夏日清晨荷塘，一朵粉色荷花挺出荷叶之上，叶片上滚着露珠，背景荷叶和晨雾被柔和虚化，远处一座小亭子若隐若现。200mm 长焦浅景深，侧逆光照亮花瓣边缘，粉绿配色清新，东方季节风光摄影。' },
  { title: '职业头像', tag: '商务人像', subtitle: '胸像 · 伦勃朗光', prompt: '一位成年职业人士穿深灰西装和白衬衫，面向镜头微笑，肩膀略微侧转。胸像构图，85mm 镜头平视，伦勃朗光在暗侧脸颊形成三角光，浅灰纯色背景，自然皮肤纹理不过度磨皮，眼神清晰，适合简历和企业官网的职业形象照。' },
  { title: '枫叶山谷', tag: '季节风光', subtitle: '侧光 · 层林尽染', prompt: '深秋山谷，两侧山坡上红枫和金色银杏交错覆盖，一条溪流从谷底穿过，溪边有一座小木桥。中焦斜俯视，上午侧光让树冠立体分明，红黄绿层次丰富，适合秋季旅游宣传海报。' },
  { title: '团队合影', tag: '企业形象', subtitle: '平视中景 · 自然互动', prompt: '五位着装商务休闲的成年同事站在明亮的开放式办公室中，围着白板自然交谈，其中两人看向镜头微笑。平视中景，35mm 镜头，背景办公区轻度虚化，窗光均匀，人物表情自然不摆拍，适合企业官网和招聘页面。' },
  { title: '卷浪瞬间', tag: '风光摄影', subtitle: '高速快门 · 浪管定格', prompt: '一道蓝绿色海浪高高卷起形成浪管，阳光从浪的背后穿透，浪壁呈现通透的翡翠色，浪尖水花被高速快门定格。贴近海面的低机位，长焦压缩，细节锐利，适合运动品牌、壁纸和海洋主题背景。' },
  { title: '工厂产线', tag: '企业宣传', subtitle: '纵深构图 · 工业质感', prompt: '整洁的现代化工厂车间，一条自动化装配线向远处延伸，机械臂正在组装金属部件，两位穿工装的技术人员在旁检查。一点透视纵深构图，广角平视，顶部冷白工业灯照明，金属与地面反光真实，适合企业宣传册与官网。' },
  { title: '雨林溪流', tag: '风光摄影', subtitle: '低机位 · 苔藓前景', prompt: '热带雨林中一条清澈溪流穿过长满苔藓的巨石，两侧是茂密的蕨类和藤蔓，一束阳光透过树冠照在水面上。低机位贴近溪石，前景苔藓清晰，绿色层次丰富，湿润空气中有淡淡光束，自然纪录风光。' },
  { title: '样板间', tag: '房产家居', subtitle: '一点透视 · 广角平视', prompt: '现代简约风格的客厅样板间，浅灰布艺沙发、胡桃木茶几，大幅落地窗外是城市天际线。一点透视构图，16mm 广角在 1.2 米高度平视，所有竖线保持垂直，室内灯与窗外日光平衡曝光，空间宽敞通透，房产宣传图。' },
  { title: '星轨古树', tag: '星空摄影', subtitle: '长时间曝光 · 同心星轨', prompt: '旷野中一棵孤立的古树剪影，背后夜空中星星围绕北极星形成一圈圈同心星轨，地平线上有一点暖色微光。广角固定机位长时间曝光，古树位于画面下方中央，深蓝夜空干净，星空风光摄影。' },
  { title: '民宿客房', tag: '酒店民宿', subtitle: '框景构图 · 自然光', prompt: '一间海景民宿客房，白色床品整齐，床尾放一条亚麻毯，落地窗外是蓝色海面和远处海岛。镜头从门口方向拍摄，用窗框形成框景，平视广角，上午自然光明亮柔和，室内外曝光均衡，适合民宿平台房源首图。' },
  { title: '晚霞剪影', tag: '风光摄影', subtitle: '逆光剪影 · 低水平线', prompt: '草原上的晚霞，天空从橙红渐变到紫蓝，一排稀疏的树木和一位牵马的人形成黑色剪影，地平线压在画面下五分之一。逆光平视，剪影轮廓干净，天空占据大部分画面，适合品牌背景和 PPT 封面。' },
  { title: '家具场景', tag: '家居电商', subtitle: '45° 侧角 · 场景搭配', prompt: '一张奶油色弧形布艺沙发放在浅木地板客厅中，搭配圆形边几、落地灯和一块浅色地毯。机位位于沙发前方 45 度侧角，中景完整展示沙发轮廓，柔和侧窗光，面料纹理清晰，配色温和统一，家居电商场景图。' },
  { title: '雪山公路', tag: '航拍风光', subtitle: '航拍 · S 形引导线', prompt: '无人机斜俯视拍摄一条盘山公路，黑色路面在雪山间形成连续的 S 形弯道，一辆红色越野车行驶在路上，路边是白雪和裸露岩石。晴天侧光，公路作为引导线贯穿画面，适合汽车广告和自驾游宣传。' },
  { title: '汽车外观', tag: '汽车广告', subtitle: '低角度 · 前三分之二视角', prompt: '一辆无品牌标志的银灰色 SUV 停在山间公路弯道旁，车头朝向画面左前方。低角度前三分之二视角，35mm 镜头，黄金时刻侧逆光沿车身线条形成高光，背景层叠山峦虚化，车漆反射真实，汽车广告主视觉。' },
  { title: '松林光束', tag: '风光摄影', subtitle: '丁达尔光 · 逆光', prompt: '清晨薄雾中的松林，阳光从树干之间斜射进来，形成一道道清晰的丁达尔光束，地面铺满松针和低矮蕨类。中焦平视，逆光让光束和雾气层次分明，深绿与暖金色调，宁静神圣的森林风光摄影。' },
  { title: '文旅航拍', tag: '文旅宣传', subtitle: '无人机俯瞰 · 大场景', prompt: '无人机高空俯瞰一座江南古镇，白墙黑瓦沿河道排列，几座石桥横跨水面，乌篷船在河中留下水纹。45 度斜俯视航拍，清晨薄雾与侧光勾出屋顶层次，画面上方留出天空用于标题，适合城市文旅宣传海报。' },
  { title: '草原毡房', tag: '文旅宣传', subtitle: '广角远景 · 人文点景', prompt: '夏季辽阔草原上，几座白色毡房散布在缓坡上，远处一群马在吃草，天空是大片积云和蓝天。广角远景，毡房位于下三分线，大面积天空和草地形成开阔感，色彩明快真实，草原文旅宣传图。' },
  { title: '数码悬浮', tag: '数码产品', subtitle: '悬浮 · 轮廓光', prompt: '一把无标志的 75 配列机械键盘悬浮在深灰背景前，略微倾斜展示键帽侧面，几颗键帽向上分离悬浮露出轴体。三分之二俯视角，冷白轮廓光勾出键盘边缘，底部有柔和蓝紫灯光，材质细节清晰，数码电商主图。' },
  { title: '悬崖海湾', tag: '风光摄影', subtitle: '高位广角 · 海岸曲线', prompt: '从海岸悬崖顶部俯瞰一片新月形海湾，碧蓝海水拍打金色沙滩，崖壁上长着低矮绿植，一条步道沿悬崖边缘延伸。广角高位俯视，海岸线形成弧形引导线，晴朗午后光，适合海滨旅游宣传。' },
  { title: '家电场景', tag: '家电电商', subtitle: '厨房实景 · 侧窗光', prompt: '一台白色空气炸锅放在浅色石英石厨房台面上，炸篮拉出，里面是金黄酥脆的鸡翅，旁边有一盘切好的柠檬和蘸酱。45 度侧角中近景，侧窗自然光，厨房背景柔和虚化，食物和产品都清晰，家电电商使用场景图。' },
  { title: '湖畔木屋', tag: '风光摄影', subtitle: '晨雾 · 暖窗光', prompt: '清晨的森林湖畔，一座红色小木屋立在水边，窗户透出暖黄灯光，湖面飘着薄雾，木栈道伸入水中。平视中景，木屋位于右侧三分线，倒影清晰，冷蓝晨色与暖窗光对比，适合民宿宣传和壁纸。' },
  { title: '母婴用品', tag: '母婴电商', subtitle: '高调柔光 · 温和色调', prompt: '一只浅粉色婴儿奶瓶和一只柔软的米色安抚玩偶放在白色婴儿床边的木质托盘上，背景是浅色纱帘。高调柔光，整体明亮无硬阴影，平视近景，色调温和干净，安全可信的母婴电商图片。' },
  { title: '茶园曲线', tag: '航拍风光', subtitle: '航拍 · 茶垄曲线', prompt: '无人机斜俯视拍摄春季山地茶园，一行行茶树沿山坡等高线排列成柔和的弧线，几位采茶人戴着斗笠散布其间，山顶有薄雾。上午柔光，嫩绿色调统一，曲线节奏感强，适合茶叶品牌和乡村文旅宣传。' },
  { title: '宠物用品', tag: '宠物电商', subtitle: '低机位 · 宠物视角', prompt: '一只金毛犬趴在浅木地板上，低头从一只陶瓷宠物食盆中吃粮，食盆放在防滑木架上。镜头贴近地面与狗眼同高，50mm 镜头，自然窗光，毛发细节真实，背景客厅柔和虚化，宠物用品电商场景图。' },
  { title: '极简雪原', tag: '桌面壁纸', subtitle: '大面积留白 · 极简', prompt: '一望无际的白色雪原，画面中只有一棵细小的孤树和一串通向它的脚印，天空是均匀的浅灰白色，与雪地几乎融为一体。中焦平视，孤树位于右下三分点，大面积留白，极简干净，适合桌面壁纸和文字排版背景。' },
  { title: '运动健身', tag: '运动广告', subtitle: '低角度仰拍 · 硬光', prompt: '一位成年健身者在深色健身房中单手提起壶铃，手臂和背部线条清晰，汗水在皮肤上反光。低角度仰拍，单侧硬光加冷色轮廓光，背景暗且简洁，画面高对比，适合运动品牌和健身房宣传海报。' },
  { title: '城市仰拍', tag: '城市风光', subtitle: '超广角仰拍 · 线条汇聚', prompt: '站在高楼群中央向上仰拍，四周玻璃幕墙摩天楼的线条向画面中心汇聚，中间露出一小片蓝天，玻璃反射出相邻建筑和云朵。14mm 超广角，强烈透视，冷蓝银色调，几何感强，适合科技和金融主题背景。' },
  { title: '户外装备', tag: '户外广告', subtitle: '广角 · 环境叙事', prompt: '一位穿橙色冲锋衣的徒步者站在高山垭口，背着登山包望向远处雪山，风吹动外套边缘。24mm 广角，人物位于画面左下三分线，大面积山景交代环境，晴天侧光，装备细节清晰，户外品牌广告图。' },
  { title: '长城晨雾', tag: '文旅宣传', subtitle: '长焦 · 山脊蜿蜒', prompt: '清晨的古长城沿山脊蜿蜒起伏，城墙和烽火台在晨雾中若隐若现，远处层层山峦退入雾气，太阳在云层后透出暖光。长焦压缩，城墙作为引导线延伸到远方，冷暖色调柔和，壮阔的文旅宣传图。' },
  { title: '钻戒火彩', tag: '珠宝广告', subtitle: '微距 · 点光火彩', prompt: '一枚铂金钻戒立在黑色亮面亚克力上，钻石在点光源下折射出彩色火彩，下方有清晰倒影。100mm 微距，焦点精确落在钻石台面，背景纯黑，两侧窄条柔光勾勒戒圈轮廓，奢华克制的珠宝广告。' },
  { title: '辫状河流', tag: '航拍风光', subtitle: '高空俯拍 · 自然纹理', prompt: '高空航拍冰川融水形成的辫状河流，无数条细小水道在灰色砾石河床上交织分叉，水色从乳白蓝到青绿变化。正顶视构图，自然纹理像抽象画，柔和阴天光，适合抽象背景、壁纸和地理主题配图。' },
  { title: '茶叶礼盒', tag: '礼品电商', subtitle: '东方陈设 · 侧光', prompt: '一只墨绿色茶叶礼盒打开放在深色木茶台上，盒内两罐茶叶，旁边是一只盛着清茶的白瓷盖碗和几片干茶叶。斜侧 45 度中近景，柔和侧光营造层次，背景素净，东方雅致但不过度装饰，礼品电商主图。' },
  { title: '滩涂水纹', tag: '航拍风光', subtitle: '高空俯拍 · 潮沟纹理', prompt: '退潮后的海边滩涂，无人机高空正顶视俯拍，潮水退去留下的潮沟像树枝一样分叉蔓延，沟中残水倒映出日出时的金粉色天空，滩面呈深灰褐色。侧光强调潮沟起伏，构图像抽象画，适合壁纸、抽象背景和地理主题配图。' },
  { title: '课程配图', tag: '教育培训', subtitle: '扁平插画 · 左侧留白', prompt: '扁平矢量风格插画，一位年轻人坐在书桌前用笔记本电脑上网课，屏幕上是简洁图表图标，周围漂浮书本、灯泡和对勾图标。蓝色与暖黄配色，线条干净，人物位于右侧，左侧留出标题空间，适合在线课程封面和 PPT 配图，无文字。' },
  { title: '海上日落', tag: '风光摄影', subtitle: '三分构图 · 暖色天空', prompt: '平静海面上的日落，太阳刚接近海平线，在水面上拉出一条金色光带，天空有几缕被染成橙粉色的薄云，远处一艘帆船剪影。水平线位于下三分线，长焦压缩让太阳更大，暖色调浓郁，适合品牌背景和壁纸。' },
  { title: 'App 首屏', tag: '互联网营销', subtitle: '3D 插画 · 渐变背景', prompt: '3D 卡通风格插画，一部手机悬浮在画面中央，屏幕弹出钱包、礼券和金币图标，周围漂浮圆润的几何体。蓝紫到粉色的柔和渐变背景，光滑塑料材质和柔和阴影，构图简洁，适合 App 首屏、活动页和推广 Banner，无文字。' },
  { title: '高原牧场', tag: '风光摄影', subtitle: '中长焦 · 人文风光', prompt: '高原湖泊边的牧场，一群牦牛在湖岸草甸上吃草，湖水深蓝，对岸是白雪覆顶的山脉，天空中云影投在山坡上。中长焦平视，牦牛群位于前景下方，层次分明，色彩纯净，高原文旅宣传图。' },
  { title: '品牌主视觉', tag: '品牌 KV', subtitle: '中心对称 · 硬光切割', prompt: '一只无标志的哑光黑色香氛瓶立在浅灰色圆柱展台中央，背后是一道弧形石墙，一束硬光从右上方斜射下来，形成清晰的光影切割。中心对称构图，平视中景，上下留出排版空间，高级灰色调，适合品牌主视觉 KV 和官网首屏。' },
  { title: '远山层叠', tag: '桌面壁纸', subtitle: '长焦剪影 · 蓝色渐层', prompt: '傍晚的连绵远山，一层层山脊剪影从近到远由深蓝渐变为浅蓝灰，山谷间填满薄雾，天空是柔和的淡橙色。长焦压缩，横向宽幅构图，画面上方留出大片干净天空，极简宁静，适合桌面壁纸、PPT 和品牌背景。' },
]

const videoTemplates: PromptTemplate[] = [
  { title: '360° 展示', tag: '电商主图视频', subtitle: '固定机位 · 转台旋转', prompt: '纯白无缝背景中央，一双白色运动鞋放在缓慢匀速旋转的白色转台上，完整转一圈展示鞋头、侧面和鞋跟。固定机位平视中景，顶部柔光箱均匀照明，鞋子结构和颜色全程一致，无品牌标志，干净的电商主图视频，一镜到底。' },
  { title: '金山延时', tag: '风光延时', subtitle: '固定延时 · 日出变色', prompt: '固定机位延时摄影，黎明前的雪山峰顶从冷蓝色逐渐被阳光染成金红色，光线自上而下沿山体移动，山腰云带缓慢流动。长焦远景，机位完全稳定，曝光平滑过渡，色彩真实，高原风光宣传片镜头。' },
  { title: '慢推特写', tag: '产品广告', subtitle: '缓慢推进 · 由中景到特写', prompt: '深灰石台上立着一只机械腕表，镜头从中景缓慢向前推进，最终停在表盘特写，秒针平稳走动。一道窄条柔光随推进从表壳边缘滑过，背景暗而干净，表盘无品牌文字，金属质感真实，精致的产品广告镜头。' },
  { title: '云海翻涌', tag: '风光延时', subtitle: '延时 · 云海流动', prompt: '山顶俯瞰云海的延时镜头，白色云海像潮水一样在山峰间翻涌流动，几座山峰露出云面，太阳从远处升起照亮云层。固定机位，云的运动连续自然，山体结构稳定，壮阔的风光片开场镜头。' },
  { title: '倒入饮品', tag: '饮品广告', subtitle: '微距 · 高速慢动作', prompt: '一只装满冰块的透明玻璃杯，冷萃咖啡从画面上方倒入，液体冲击冰块并缓慢上升，杯壁凝出水珠。侧面微距固定镜头，逆光让咖啡呈琥珀色，高速摄影慢动作，液体流动真实，深色背景，咖啡饮品广告。' },
  { title: '草原前飞', tag: '航拍风光', subtitle: '无人机低空前飞', prompt: '无人机贴着夏季草原低空向前平稳飞行，草叶和野花从画面下方快速掠过，远处缓坡和雪山逐渐靠近，天空积云投下移动的影子。运动匀速流畅，地形结构一致，色彩清新，草原文旅宣传镜头。' },
  { title: '水花入镜', tag: '饮品广告', subtitle: '升格慢动作 · 定机', prompt: '一颗草莓从画面顶部落入装满气泡水的玻璃杯，激起晶莹水花和大量细小气泡，随后草莓缓慢下沉。正面固定镜头，升格慢动作，浅粉色背景，强逆光让水花通透，杯子位置稳定，清爽的饮品广告。' },
  { title: '海浪顶视', tag: '航拍风光', subtitle: '正顶视 · 浪花往复', prompt: '无人机正顶视悬停在海岸上方，蓝绿色海浪一层层涌上金色沙滩，白色浪花展开后退去，在沙滩上留下湿润痕迹。镜头保持静止，浪花运动自然，色彩通透，适合海滨旅游宣传和视频背景。' },
  { title: '精华滴落', tag: '美妆广告', subtitle: '微距 · 焦点转移', prompt: '一支玻璃滴管悬在精华瓶上方，一滴透明精华缓缓聚集后滴落回瓶中。微距镜头，焦点从滴管尖端平稳转移到瓶身，浅蓝背景，侧逆光让液滴通透发亮，瓶身无可读文字，高端护肤品广告镜头。' },
  { title: '瀑布横移', tag: '风光空镜', subtitle: '缓慢横移 · 前景掠过', prompt: '森林中的高大瀑布，水流从岩壁上连续落入深潭，水雾在阳光下泛起淡淡彩虹。镜头在潭边缓慢横移，前景蕨叶从画面边缘划过，产生视差层次，水流方向和速度自然，清爽的风光纪录片镜头。' },
  { title: '质地抹开', tag: '美妆详情', subtitle: '俯拍定机 · 质地展示', prompt: '浅粉色亚克力板上一团白色乳霜，一根手指将乳霜缓缓抹开，形成顺滑的弧形痕迹和细腻拉丝。俯拍固定镜头，柔和侧光突出膏体光泽，手部动作连贯，背景干净，美妆电商详情页质地展示视频。' },
  { title: '林间光束', tag: '风光空镜', subtitle: '缓推 · 丁达尔光', prompt: '清晨薄雾中的松林，阳光从树干之间斜射形成一道道光束，镜头沿林间小路缓慢向前推进，光束在雾气中缓缓变化，地面松针和蕨类逐渐靠近。运动平稳，树木结构一致，宁静的森林风光镜头。' },
  { title: '口红旋出', tag: '美妆广告', subtitle: '特写 · 缓慢横移', prompt: '一支金属外壳口红立在浅色大理石上，膏体缓慢旋出，镜头同时从左向右平稳横移，一道柔光掠过膏体表面。特写浅景深，正红色膏体质地细腻，管身无文字，画面简洁，美妆广告产品镜头。' },
  { title: '浪花慢放', tag: '风光空镜', subtitle: '低机位 · 升格慢动作', prompt: '黄昏的礁石海岸，一道海浪撞上前景礁石，白色浪花高高溅起后缓慢落下。镜头贴近礁石低机位固定，升格慢动作，逆光让水花晶莹透亮，远处晚霞橙粉色，富有冲击力的海岸空镜。' },
  { title: '开箱展示', tag: '社媒种草', subtitle: '第一视角 · 手部操作', prompt: '第一人称俯视视角，一双手打开白色快递纸盒，拨开纸屑，取出一台浅绿色无线音箱举到镜头前转动展示。手部动作自然连贯，窗边柔光，桌面整洁，产品结构全程一致，真实的社媒开箱种草视频。' },
  { title: '银河延时', tag: '星空延时', subtitle: '固定延时 · 银河转动', prompt: '固定机位星空延时，银河从山峰后方缓慢升起并划过夜空，星点随地球自转平稳移动，地平线上偶有车灯划过。超广角构图，地景稳定清晰，星点不闪烁，深蓝夜空干净，星空风光片镜头。' },
  { title: '使用演示', tag: '产品演示', subtitle: '过肩镜头 · 真实操作', prompt: '一位成年人站在衣架前，手持白色挂烫机熨烫一件浅蓝衬衫，蒸汽喷出后褶皱逐渐被抚平。过肩镜头中近景，焦点在挂烫机喷头和衣料上，室内自然光，动作缓慢清楚，真实的产品使用演示视频。' },
  { title: '极光舞动', tag: '星空风光', subtitle: '超广角定机 · 光带流动', prompt: '北极圈雪原的夜空中，绿色和淡紫色极光带缓缓舞动，像帘幕一样起伏变化，倒映在结冰湖面上，湖边小木屋亮着暖灯。超广角固定镜头，极光运动自然柔和，雪地和星空清晰，真实极光风光镜头。' },
  { title: '前后对比', tag: '效果演示', subtitle: '固定机位 · 擦拭对比', prompt: '一块带油污的白色厨房灶台，一只手拿着喷过清洁剂的抹布从左向右擦过一次，擦过的区域变得干净发亮，与未擦区域形成清晰对比。俯拍固定镜头，光线一致，动作匀速，清洁用品效果演示视频。' },
  { title: '沙丘拉升', tag: '航拍风光', subtitle: '后退拉升 · 揭示全景', prompt: '无人机从沙丘脊线的近处开始，向后退并缓慢拉升，逐渐揭示连绵起伏的金色沙海和一支在沙脊上行走的驼队。傍晚侧光强调沙纹和阴影，运动平稳连续，壮阔的沙漠风光宣传镜头。' },
  { title: '爆炸拆解', tag: '数码广告', subtitle: '中心定机 · 部件分离', prompt: '深灰背景中央一只白色无线耳机，外壳、电池、主板和喇叭单元沿同一轴线缓慢分离悬浮，停顿后再依次合拢复原。固定中景，冷白轮廓光勾出每个部件，结构合理一致，精密的数码产品技术卖点动画。' },
  { title: '稻浪起伏', tag: '航拍风光', subtitle: '无人机横移 · 风吹稻浪', prompt: '无人机在金黄稻田上方缓慢横向飞行，风吹过稻田形成一道道起伏的稻浪，田埂上一位农人推着自行车走过。斜俯视角度，阳光暖金，稻穗运动自然，乡村振兴和农业宣传片镜头。' },
  { title: '悬浮旋转', tag: '数码广告', subtitle: '环绕 · 轮廓光扫过', prompt: '一部无标志的深色智能手机悬浮在纯黑背景中，缓慢旋转半圈从正面转到背面，一道冷白轮廓光沿金属边框扫过。镜头同时小幅环绕，机身结构和摄像模组保持一致，科技感新品发布宣传镜头。' },
  { title: '雪山环绕', tag: '航拍风光', subtitle: '无人机环绕 · 主峰居中', prompt: '无人机围绕一座雪山主峰缓慢环绕，峰顶始终位于画面中央，周围冰川和山脊随环绕依次展开，峰顶飘着细细的旗云。晴朗上午侧光，雪面质感真实，运动平稳，高原风光宣传片镜头。' },
  { title: '模特走秀', tag: '服装电商', subtitle: '正面后退跟拍 · 全身', prompt: '浅灰摄影棚中，一位成年女模特穿燕麦色长风衣朝镜头走来，衣摆随步伐自然摆动。镜头在正前方匀速后退跟拍，保持全身构图，50mm 视角，柔光均匀，面部和服装细节全程一致，服装电商展示视频。' },
  { title: '倒影上摇', tag: '风光空镜', subtitle: '上摇 · 倒影到实景', prompt: '镜头从平静湖面上雪山的倒影开始，缓慢向上摇起，越过水平线后停在真实的雪山和天空上。无风湖面倒影清晰，摇镜匀速平稳，蓝绿湖水和白色雪峰对称呼应，清透的风光空镜。' },
  { title: '面料飘动', tag: '服装广告', subtitle: '升格慢动作 · 风吹', prompt: '一位成年模特穿浅色真丝长裙站在白色背景前，风机吹起裙摆和袖口，面料在空中缓慢飘动并呈现柔和光泽。中景固定镜头，升格慢动作，侧逆光让面料半透发亮，人物保持静止，突出面料垂感的服装广告。' },
  { title: '城市车流', tag: '城市延时', subtitle: '固定延时 · 夜景光轨', prompt: '城市夜晚的高架立交桥固定延时，车流形成红白两色连续光轨沿匝道流动，周围高楼灯光闪烁，天空云层缓慢移动。高处俯视机位，建筑完全稳定，光轨流畅，城市宣传片转场镜头。' },
  { title: '转身展示', tag: '服装电商', subtitle: '定机全身 · 原地转身', prompt: '一位成年男模特穿深蓝工装夹克和卡其裤站在浅灰背景前，缓缓原地转身一圈，展示正面、侧面和背面版型，最后回到正面停住。固定全身机位，柔光均匀，服装结构和人物全程一致，电商服装展示视频。' },
  { title: '水乡行船', tag: '文旅宣传', subtitle: '平行跟拍 · 古镇河道', prompt: '江南古镇的清晨，一艘乌篷船沿河道缓缓前行，船夫轻摇木橹，镜头在河岸边与船平行跟拍，白墙黑瓦和石桥依次从背景经过。薄雾柔光，水面涟漪自然，古镇文旅宣传镜头。' },
  { title: '鞋履落地', tag: '鞋类广告', subtitle: '贴地低机位 · 慢动作', prompt: '一只穿着跑鞋的脚从画面上方踩入城市路面的浅水洼，水花向四周溅起。镜头贴地低机位固定，升格慢动作，鞋子是前景主体，背景街道晨光虚化，侧逆光照亮水花，动感运动鞋广告镜头。' },
  { title: '樱花飘落', tag: '季节风光', subtitle: '升格慢动作 · 浅景深', prompt: '春日樱花树下，粉白花瓣随微风缓缓飘落，前景几片花瓣从镜头前划过并虚化，背景古寺屋檐柔和。中焦固定镜头，升格慢动作，花瓣运动轻盈自然，柔和阴天光，春季风光空镜。' },
  { title: '跑步跟拍', tag: '运动广告', subtitle: '侧向平行跟拍 · 速度感', prompt: '清晨江边步道，一位成年跑者匀速向前奔跑，镜头在侧面与跑者平行稳定跟拍，前景栏杆依次快速掠过，增强速度感。中景构图，晨光勾出人物轮廓，步态和服装全程一致，运动品牌广告镜头。' },
  { title: '雨打荷叶', tag: '季节风光', subtitle: '微距定机 · 水珠滚落', prompt: '夏日雨中，雨滴落在一片宽大的荷叶上，水珠在叶面汇聚滚动，最后从叶边滑落，旁边一朵粉色荷花轻轻摇动。微距固定镜头，浅景深，青绿色调，雨滴和叶脉细节真实，东方意境风光空镜。' },
  { title: '健身发力', tag: '健身宣传', subtitle: '低角度仰拍 · 硬光', prompt: '深色健身房中，一位成年健身者双手握住壶铃，从低处平稳提起至胸前并停住，肌肉线条清晰。低角度仰拍中景固定镜头，单侧硬光加冷色轮廓光，背景简洁，动作发力真实，健身房宣传视频。' },
  { title: '秋路车窗', tag: '风光空镜', subtitle: '车载视角 · 前进推进', prompt: '车载前视视角，镜头沿一条两侧种满金黄银杏的乡间公路平稳前进，落叶在路面翻飞，树冠在头顶形成金色隧道。运动匀速流畅，阳光透过树叶闪烁，秋季旅行和自驾游宣传镜头。' },
  { title: '出锅上菜', tag: '餐饮广告', subtitle: '侧面特写 · 热气升腾', prompt: '餐厅后厨，一位厨师颠动铁锅中的辣子鸡丁，随后将菜倒入白瓷盘，热气在暖光下升起。侧面近景，镜头小幅推进到盘中特写，食材色泽和油光真实，背景虚化，动作连贯，餐饮门店宣传视频。' },
  { title: '雪林穿梭', tag: '航拍风光', subtitle: 'FPV 穿梭 · 雪林', prompt: 'FPV 穿越机视角，镜头在覆雪的松林间低空快速穿梭，绕过树干后从林间空地升起，露出远处雪山和蓝天。运动流畅有速度感，树木结构稳定不扭曲，雪粒在阳光下闪烁，冬季旅游宣传镜头。' },
  { title: '芝士拉丝', tag: '美食广告', subtitle: '微距 · 缓慢上提', prompt: '一只手从刚出炉的披萨上缓缓提起一块三角饼，芝士被拉出长长的丝并逐渐断开，表面冒出热气。侧面微距近景固定镜头，暖色侧光突出芝士光泽，背景暗色虚化，美食外卖平台广告镜头。' },
  { title: '海岛揭示', tag: '航拍风光', subtitle: '拉高揭示 · 海岛全貌', prompt: '无人机从浅滩上一艘白色小船的正上方开始，缓慢向上拉高，逐渐揭示整座热带海岛、弧形白色沙滩和由浅到深渐变的海水。正午光线通透，运动平稳，海岛旅游宣传片开场镜头。' },
  { title: '食材叠落', tag: '食品广告', subtitle: '定机 · 依次落下', prompt: '白色背景前，汉堡的面包底、牛肉饼、芝士片、生菜、番茄和面包顶依次从上方落下，精准叠成一个完整汉堡，最后轻轻弹动。正面固定镜头，节奏明快，柔光均匀，食材质感真实，快餐广告镜头。' },
  { title: '峡谷穿越', tag: '航拍风光', subtitle: '低空前飞 · 河谷穿越', prompt: '无人机沿峡谷中的碧绿河流低空向前飞行，两侧红色砂岩崖壁高耸，镜头随河道弯曲平稳转向，水面倒映崖壁。清晨侧光照亮岩层纹理，运动流畅，地理纪录片和户外品牌镜头。' },
  { title: '咖啡拉花', tag: '门店宣传', subtitle: '斜俯拍 · 奶泡成形', prompt: '咖啡师一手托住白色陶杯，一手缓慢倒入牛奶，奶泡在咖啡表面形成心形图案，最后抬起奶缸收尾。斜俯拍近景固定镜头，杯形和手部全程一致，奶流连续，暖色窗光，咖啡门店宣传视频。' },
  { title: '花田横移', tag: '季节风光', subtitle: '低位横移 · 花垄节奏', prompt: '夏季薰衣草田，镜头贴近花穗高度缓慢横移，前景紫色花穗依次掠过，蜜蜂在花间飞舞，背景石头农舍和夕阳柔和虚化。运动平稳，花穗随风轻摇，紫金配色，适合文旅和香氛品牌宣传。' },
  { title: '探店一镜', tag: '探店视频', subtitle: '稳定器前推 · 穿门入店', prompt: '镜头从街边平稳向前推进，穿过一家原木风咖啡馆的玻璃门进入店内，沿吧台继续前移，最后停在窗边座位。稳定器一镜到底，运动匀速不晃动，店内暖光与窗外日光平衡，空间结构一致，探店视频开场镜头。' },
  { title: '雾凇摇镜', tag: '季节风光', subtitle: '水平摇镜 · 冬日江岸', prompt: '冬日清晨江边，镜头从左向右缓慢水平摇动，挂满白色雾凇的柳树依次进入画面，江面冒出缕缕水汽，远处小桥若隐若现。高调明亮，摇镜匀速，冰晶细节清晰，宁静的冬季风光空镜。' },
  { title: '样板间漫游', tag: '房产广告', subtitle: '稳定器缓推 · 空间连贯', prompt: '现代简约风格样板间，镜头从玄关缓慢向前推进，经过客厅沙发区，最后停在落地窗前展示城市景观。广角平视，竖线保持垂直，运动平稳，家具和空间结构全程一致，室内外曝光平衡，房产宣传视频。' },
  { title: '冰川平移', tag: '航拍风光', subtitle: '航拍平移 · 冰川纹理', prompt: '无人机沿巨大冰川侧面平行飞行，蓝白色冰川表面布满裂隙和纹理，冰川末端融水汇入灰绿色湖泊，几块浮冰缓慢漂动。阴天柔光让冰的蓝色更通透，运动平稳，极地自然纪录片镜头。' },
  { title: '开窗见景', tag: '酒店民宿', subtitle: '缓推 · 窗帘展开', prompt: '海景民宿客房内，白色窗帘缓缓向两侧拉开，阳光照进房间，露出窗外蓝色海面。镜头同时从床尾向窗口缓慢推进，床品和家具保持一致，室内外曝光平衡，清新明亮的民宿宣传视频。' },
  { title: '火山远景', tag: '风光纪实', subtitle: '远景定机 · 熔岩流动', prompt: '夜晚的活火山远景，火山口持续喷出橙红色熔岩，熔岩沿山坡缓慢流下，上方烟柱被映成暖红色并缓缓升腾。长焦固定镜头，安全距离拍摄，深蓝夜空中星点可见，真实自然纪录片镜头。' },
  { title: '城市航拍', tag: '文旅宣传', subtitle: '无人机前飞 · 缓慢抬升', prompt: '傍晚蓝调时刻，无人机从江面低空向前飞行，随后缓慢抬升，逐渐展现江岸亮灯的城市天际线和跨江大桥。航拍运动平稳连续，建筑结构稳定，灯光与天色自然，城市文旅宣传片开场镜头。' },
  { title: '胡杨横移', tag: '季节风光', subtitle: '逆光横移 · 金色树林', prompt: '深秋傍晚的胡杨林，镜头缓慢横移，金黄树冠在逆光中透亮发光，粗壮树干依次形成剪影掠过，太阳在枝叶间闪现星芒。运动平稳，树叶随风微动，暖金色调，秋季文旅宣传镜头。' },
  { title: '航拍环绕', tag: '文旅宣传', subtitle: '无人机环绕 · 主体居中', prompt: '黄金时刻，无人机围绕山顶一座古塔缓慢环绕约四分之一圈，古塔始终位于画面中央，背景层叠山峦和云海随环绕缓慢变化。航拍运动平稳，建筑结构一致，暖色侧光，景区宣传视频。' },
  { title: '长城跟随', tag: '文旅宣传', subtitle: '航拍跟随 · 沿城墙飞行', prompt: '清晨薄雾中，无人机沿着山脊上蜿蜒的古长城向前飞行，城墙和烽火台依次从画面下方经过，远处层层山峦退入雾气。航拍运动平稳，城墙结构一致，暖色晨光，壮阔的文旅宣传镜头。' },
  { title: '跟车行驶', tag: '汽车广告', subtitle: '低位平行跟车 · 过弯', prompt: '一辆无品牌标志的银灰色 SUV 沿海岸公路平稳过弯，镜头在车身侧面低位平行跟拍，车轮转动与车速匹配，路边护栏和海面依次掠过。傍晚侧逆光勾出车身线条，车型全程一致，汽车广告镜头。' },
  { title: '梯田云雾', tag: '风光延时', subtitle: '固定延时 · 云雾流动', prompt: '山区梯田的固定延时，清晨云雾在层层梯田间缓慢流动、聚拢又散开，水面倒映的天色由粉蓝变为明亮的白天。中长焦斜俯视，梯田曲线稳定，云雾运动自然，田园风光片镜头。' },
  { title: '车灯扫光', tag: '汽车广告', subtitle: '微距横移 · 光线扫过', prompt: '暗色摄影棚中，一辆深色汽车的前大灯局部特写，镜头缓慢向右横移，一道窄条柔光沿车灯和车身曲面从左向右扫过，车灯随后点亮。微距浅景深，漆面和灯组细节真实，无品牌标志，高级汽车广告镜头。' },
  { title: '天空之镜', tag: '航拍风光', subtitle: '航拍环绕 · 人物点景', prompt: '盐湖浅水面完整倒映天空和云朵，一位穿红色长裙的成年人站在湖中央，无人机围绕人物缓慢环绕半圈，人物和倒影始终居中。人物很小，天空蓝白通透，运动平稳，旅行宣传和社媒爆款镜头。' },
  { title: '珠宝转台', tag: '珠宝广告', subtitle: '微距 · 转台火彩', prompt: '黑色亮面台面上，一枚铂金钻戒在小转台上缓慢旋转，点光源下钻石折射出闪烁的彩色火彩，下方倒影随之移动。微距固定镜头，焦点锁定钻石，戒托结构全程一致，奢华克制的珠宝广告。' },
  { title: '灯塔浪涌', tag: '风光空镜', subtitle: '远景定机 · 灯束扫过', prompt: '蓝调时刻的海角悬崖，白色灯塔的灯束缓缓旋转扫过海面，下方海浪持续拍打礁石溅起浪花。中长焦固定远景，灯束旋转匀速，天空由浅紫过渡到深蓝，宁静有故事感的海岸空镜。' },
  { title: '香氛环绕', tag: '产品广告', subtitle: '小幅环绕 · 玻璃折射', prompt: '深灰石台上一只无标签的烟灰色香水瓶保持静止，镜头围绕瓶身缓慢移动小半圈，一道窄条柔光沿玻璃棱边滑过，背景薄纱轻轻起伏。玻璃折射精准，暗背景，银灰色调，精致的香氛产品广告。' },
  { title: '雨夜街道', tag: '城市风光', subtitle: '低机位推进 · 积水倒影', prompt: '雨后夜晚的老城街道，镜头贴近积水低机位缓慢向前推进，水面倒映霓虹和路灯暖光，雨滴落下荡开涟漪，远处一位撑伞行人走过。招牌无可读文字，运动平稳，电影感城市夜景空镜。' },
  { title: '礼盒开盖', tag: '节日营销', subtitle: '俯拍定机 · 开盒展示', prompt: '深红色背景前，一双手缓缓掀开一只烫金红色礼盒的盒盖，露出整齐排列的月饼和金色内衬，几粒金色光点轻轻飘落。俯拍固定镜头，手部动作连贯，礼盒结构一致，喜庆的节日礼盒电商视频。' },
  { title: '竹林仰望', tag: '风光空镜', subtitle: '仰拍 · 缓慢旋转', prompt: '站在竹林中央向上仰拍，高大竹竿向天空汇聚，竹叶在风中轻轻摇动，阳光从叶隙间闪烁。镜头缓慢旋转约四分之一圈，透视稳定，绿色层次丰富，清幽的东方风光空镜，适合转场和片头。' },
  { title: '功能演示', tag: '家电电商', subtitle: '侧面定机 · 功能展示', prompt: '厨房台面上一台白色空气炸锅，一只手将炸篮缓缓拉出，露出金黄酥脆的薯条，热气轻轻升起，随后用夹子夹起几根展示。45 度侧面中近景固定镜头，自然窗光，产品和食物清晰，家电电商功能演示视频。' },
  { title: '雪原独行', tag: '风光空镜', subtitle: '远景定机 · 人物穿越', prompt: '一望无际的白色雪原，一位穿深色外套的成年人从画面左侧缓缓走入，沿直线走向右侧，身后留下一串脚印，细雪随风轻扬。远景固定镜头，人物很小，大面积留白，极简冷静的风光空镜。' },
  { title: '扫地跟随', tag: '家电电商', subtitle: '贴地低机位 · 跟随', prompt: '明亮的浅木地板客厅，一台白色扫地机器人沿沙发边缘平稳前进，边刷将地面碎屑扫入机身。镜头贴地在侧后方缓慢跟随，机身结构保持一致，行进路线自然，室内光线明亮，家电电商演示视频。' },
  { title: '奔马跟摇', tag: '风光纪实', subtitle: '长焦跟摇 · 草原奔马', prompt: '夏季草原上，一群马沿河岸奔跑，马蹄溅起水花，鬃毛随风飘动。长焦镜头水平跟摇，马群保持在画面中央，背景草原和远山被压缩虚化，动作自然有力，草原文旅宣传镜头。' },
  { title: '逗猫互动', tag: '宠物用品', subtitle: '贴地机位 · 自然反应', prompt: '浅色客厅地板上，一只橘猫盯着晃动的羽毛逗猫棒，伏低身体后跳起扑抓。镜头贴地与猫眼同高固定拍摄，猫的动作和毛发真实自然，窗边柔光，背景虚化，宠物用品种草视频。' },
  { title: '鸟群掠湖', tag: '风光纪实', subtitle: '长焦定机 · 鸟群飞过', prompt: '清晨平静的湖面，一群白色水鸟从画面右侧贴着水面飞过，翅膀拍起细小水花，倒影随之移动，远处芦苇和薄雾柔和。长焦固定镜头，鸟群飞行轨迹自然，冷蓝晨色，宁静的湿地风光镜头。' },
  { title: '母婴温馨', tag: '母婴品牌', subtitle: '高调柔光 · 近景定机', prompt: '白色婴儿床边，一位成年母亲把一只米色安抚玩偶轻轻放到婴儿手边，婴儿小手握住玩偶。近景固定镜头，高调柔光，画面明亮无硬阴影，动作缓慢温柔，人物不正对镜头，温馨的母婴品牌宣传视频。' },
  { title: '溪流苔藓', tag: '风光空镜', subtitle: '微距横移 · 溪水流动', prompt: '雨林中清澈溪流流过长满苔藓的石头，镜头贴近水面缓慢横移，前景苔藓和水珠清晰，水流在石间形成细小漩涡，一束阳光照在水面闪烁。浅景深，绿色饱和，湿润真实的自然空镜。' },
  { title: '口播背景', tag: '知识口播', subtitle: '中景定机 · 浅景深', prompt: '一位穿浅蓝衬衫的成年讲解者坐在书房中，面向镜头自然讲话并配合简单手势。胸部以上中景固定镜头，85mm 浅景深，背景书架和暖色台灯柔和虚化，主光柔和均匀，适合知识口播和带货讲解视频。' },
  { title: '海面日落', tag: '风光延时', subtitle: '固定延时 · 太阳落海', prompt: '平静海面上的日落延时，太阳缓慢沉入海平线，水面金色光带逐渐变短，天空从金橙渐变到粉紫，远处一艘帆船剪影静止。长焦固定机位，水平线放平，色彩过渡平滑，品牌片尾和视频背景镜头。' },
  { title: '访谈机位', tag: '企业宣传', subtitle: '侧面中景 · 访谈布光', prompt: '一位穿深色西装的成年企业负责人坐在会议室中，看向画面外的提问者自然讲述。侧面三分之二角度中景固定镜头，主光从人物面向一侧打入，背景暗部有轻微轮廓光，视线方向正确，企业宣传片访谈镜头。' },
  { title: '雷暴远景', tag: '风光延时', subtitle: '远景延时 · 闪电云团', prompt: '傍晚的平原上空，巨大的积雨云团缓慢翻滚堆积，云中不时闪现闪电照亮云层，地面上一座孤立农舍和一条公路。固定远景延时，云层运动壮观自然，地景稳定，适合气象和自然纪录片镜头。' },
  { title: '办公空镜', tag: '企业宣传', subtitle: '横移空镜 · 氛围铺垫', prompt: '明亮的开放式办公室，镜头沿工位缓慢横移，几位成年员工在电脑前工作，两人在白板前讨论。人物不看镜头，背景景深自然，窗光均匀，运动平稳，用于企业宣传片和招聘视频的氛围空镜。' },
  { title: '山脊流云', tag: '风光延时', subtitle: '固定延时 · 云影流动', prompt: '晴朗午后的连绵山脊，固定延时拍摄，大块白云在蓝天中快速流过，云影在山坡草甸上移动，光影明暗交替。广角平视，山体完全稳定，色彩明快，适合户外品牌、文旅宣传和视频转场。' },
  { title: '产线推轨', tag: '工业宣传', subtitle: '推轨横移 · 工业质感', prompt: '现代化工厂车间，镜头沿自动化装配线平稳横移，机械臂依次抓取并组装金属部件，远处技术人员检查设备。中景构图，顶部冷白工业灯照明，机械动作精准有序，工业企业宣传片镜头。' },
  { title: '公路航拍', tag: '航拍风光', subtitle: '航拍跟随 · S 形山路', prompt: '无人机在后上方跟随一辆红色越野车，车辆沿雪山间的 S 形盘山公路平稳行驶，镜头随弯道缓慢转向，逐渐展现雪山和山谷全景。晴天侧光，车辆结构一致，运动流畅，自驾游和汽车广告镜头。' },
  { title: '手作特写', tag: '品牌故事', subtitle: '手部特写 · 连贯操作', prompt: '手工皮具工作台上，匠人的双手将针穿过深棕皮革边缘的预留孔，再平稳拉紧蜡线完成一针。微距固定镜头，针线走向合理，皮革纹路和手部细节真实，柔和侧光，背景工具虚化，手工品牌故事视频。' },
  { title: '雨巷檐滴', tag: '东方意境', subtitle: '近景定机 · 檐下雨帘', prompt: '江南雨巷，黑瓦屋檐下雨水连成细细的雨帘落下，在青石板上溅起细小水花，背景一位撑油纸伞的行人缓缓走过并虚化。近景固定镜头，浅景深，青灰色调，雨水运动真实，东方意境空镜。' },
  { title: '茶艺冲泡', tag: '茶饮品牌', subtitle: '侧面特写 · 注水出汤', prompt: '深色木茶台上，一只手提起公道杯将清亮茶汤缓缓注入白瓷品茗杯，茶汤呈淡金色，表面轻微冒出热气。侧面特写固定镜头，柔和侧光，背景素净虚化，水流连续自然，东方茶饮品牌视频。' },
  { title: '枫叶落水', tag: '季节风光', subtitle: '微距定机 · 涟漪展开', prompt: '深秋溪边，一片红枫叶缓缓飘落到平静水面，荡开一圈圈涟漪，水面倒映着金黄树冠。微距固定镜头，浅景深，叶片运动轻盈自然，涟漪清晰，暖红与金黄配色，秋季风光空镜。' },
  { title: '滑动变焦', tag: '镜头语言', subtitle: '希区柯克变焦 · 空间压迫', prompt: '一位成年人站在长走廊中央看向镜头，人物大小保持不变，背景走廊在画面中逐渐拉长后退，形成空间压迫感。正面平视中景，运动平稳，人物和走廊结构一致，冷色调光线，适合悬疑剧情或广告转折点的镜头练习。' },
  { title: '湖畔晨雾', tag: '风光空镜', subtitle: '缓推 · 木屋暖窗', prompt: '清晨森林湖畔，镜头沿木栈道缓慢向前推进，湖面薄雾缓缓流动，前方红色小木屋窗户透出暖光，倒影在水中轻轻晃动。运动平稳，冷蓝晨色与暖窗光对比，民宿宣传和视频开场镜头。' },
  { title: '甩镜转场', tag: '镜头语言', subtitle: '快速横甩 · 动态模糊', prompt: '咖啡馆内，镜头先拍一位成年顾客拿起咖啡杯，随后快速向右横甩，画面产生强烈横向动态模糊，停稳后落在吧台上的甜点展示柜。节奏利落，前后场景光线一致，适合短视频转场剪辑的甩镜素材。' },
  { title: '城市俯降', tag: '航拍风光', subtitle: '正顶视下降 · 旋转', prompt: '无人机正顶视从高空缓慢下降，同时顺时针轻轻旋转，城市十字路口的车流、斑马线和行人逐渐变大，周围楼顶花园和道路形成几何图形。运动平稳，建筑结构稳定，城市宣传片转场镜头。' },
  { title: '前后景转焦', tag: '镜头语言', subtitle: '焦点转移 · 引导视线', prompt: '窗边桌面上，前景是一只白色护手霜，后景一位成年人正在看书。镜头固定，焦点先落在前景产品上，随后平稳转移到后景人物，产品逐渐虚化，人物变清晰。柔和窗光，适合产品与使用者关联的广告镜头。' },
  { title: '珊瑚跟游', tag: '海洋风光', subtitle: '水下跟游 · 珊瑚礁', prompt: '清澈热带浅海水下，镜头跟随一只海龟缓慢游过五彩珊瑚礁，小鱼群在周围散开又聚拢，阳光从水面投下摇曳光纹。水下稳定跟拍，海龟动作自然，蓝绿水色通透，海洋旅游和环保宣传镜头。' },
  { title: '升降揭示', tag: '镜头语言', subtitle: '摇臂上升 · 揭示全景', prompt: '镜头从花摊前一桶鲜花的低位特写开始，平稳向上升起，越过花束后逐渐揭示整条热闹的周末市集街道和人群。摇臂升降运动连贯，运动结束时保持全景，上午自然光，适合城市活动和品牌活动开场镜头。' },
  { title: '驼队剪影', tag: '风光纪实', subtitle: '长焦定机 · 沙脊剪影', prompt: '日落时分的沙漠，一支驼队沿沙脊缓慢行走，在金红色天空前形成清晰的剪影，沙粒被风轻轻吹起。长焦固定镜头，驼队从画面左侧走向右侧，步态自然，暖色调浓郁，壮阔的沙漠风光镜头。' },
  { title: '穿梭镜头', tag: '镜头语言', subtitle: 'FPV 穿越 · 速度感', prompt: 'FPV 穿越机视角，镜头从商场中庭上方俯冲而下，贴近扶梯快速向前穿过，越过两侧店铺后从中庭开口抬升。运动快速流畅，建筑结构稳定不扭曲，室内光线明亮，适合商场、展会和城市宣传的速度感镜头。' },
  { title: '茶园航拍', tag: '航拍风光', subtitle: '航拍前飞 · 茶垄曲线', prompt: '春季清晨，无人机沿山地茶园缓慢向前飞行并略微抬升，一行行弧形茶垄从画面下方经过，几位戴斗笠的采茶人在其间劳作，山顶薄雾流动。嫩绿色调统一，运动平稳，茶叶品牌和乡村文旅镜头。' },
  { title: '环绕人物', tag: '镜头语言', subtitle: '180° 环绕 · 主体定格', prompt: '城市天台上，一位穿黑色西装的成年人静止站立看向远方，镜头围绕人物平稳环绕半圈，背景城市天际线随之转动。人物始终位于画面中央，逆光勾出人物轮廓，面部和服装一致，品牌人物宣传片镜头。' },
  { title: '湖上划艇', tag: '航拍风光', subtitle: '航拍跟随 · 顶视划行', prompt: '无人机正顶视跟随一只黄色皮划艇划过碧绿冰川湖，桨叶划开水面留下V形水纹，湖底石头隐约可见。镜头匀速跟随，皮划艇始终位于画面中央，色彩通透，户外运动和旅游宣传镜头。' },
  { title: '日转夜延时', tag: '镜头语言', subtitle: '固定延时 · 时间流逝', prompt: '固定机位延时摄影，城市十字路口从傍晚到夜晚，天色由暖橙渐变为深蓝，街灯和楼宇灯光依次亮起，车流形成光轨。建筑和机位完全稳定，曝光平滑过渡，适合城市宣传片和时间转场镜头。' },
  { title: '夜城环绕', tag: '城市风光', subtitle: '航拍环绕 · 地标高楼', prompt: '夜晚的城市中心，无人机围绕一座亮灯的地标高楼缓慢环绕，周围楼群灯光和街道车流随环绕依次展开，江面倒映城市光影。运动平稳，建筑结构一致不扭曲，城市夜景宣传片镜头。' },
  { title: '片尾落版', tag: '品牌收尾', subtitle: '定机后拉 · 留标版区', prompt: '浅灰色圆柱展台中央立着一只无标志的哑光黑色香氛瓶，镜头从瓶身特写缓慢向后拉开，露出完整展台和干净背景，画面上方逐渐留出大面积空白用于放置品牌标志。柔和硬光切割背景，结尾停稳，广告片尾落版镜头。' },
  { title: '远山后拉', tag: '风光空镜', subtitle: '缓慢后拉 · 片尾留白', prompt: '傍晚连绵远山的层层剪影由深蓝渐变到浅蓝灰，山谷间薄雾缓缓流动，镜头缓慢向后拉开并略微上升，画面上方逐渐留出大片淡橙色天空。运动平稳，结尾停稳，适合片尾落版和视频背景。' },
]

const videoCapabilities: Array<{ id: VideoCapability; label: string; disabled?: boolean }> = [
  { id: 'seedance', label: 'Seedance 视频' },
  { id: 'grok', label: 'Grok 视频' },
  { id: 'minimax', label: 'MiniMax H3 视频' },
]

const imageCapabilities: Array<{ id: ImageCapability; label: string }> = [
  { id: 'image2', label: 'Image 生图' },
  { id: 'grok', label: 'Grok 生图' },
  { id: 'banner', label: 'Banner 生图' },
]

const defaultAspectOptions = [
  { value: '1:1', label: '1:1 方形' },
  { value: '3:2', label: '3:2 横向' },
  { value: '2:3', label: '2:3 纵向' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '9:16', label: '9:16 竖屏' },
]

const videoAspectOptions = [
  { value: '1:1', label: '1:1 方形' },
  { value: '16:9', label: '16:9 横屏' },
  { value: '9:16', label: '9:16 竖屏' },
  { value: '4:3', label: '4:3 横向' },
  { value: '3:4', label: '3:4 竖向' },
  { value: '3:2', label: '3:2 横向' },
  { value: '2:3', label: '2:3 竖向' },
  { value: '21:9', label: '21:9 超宽' },
]
const GROK_VIDEO_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3']

const image2RatioOptions = [
  { value: '1:1', label: '1:1 方形' },
  { value: '3:2', label: '3:2 横向' },
  { value: '2:3', label: '2:3 纵向' },
  { value: '16:9', label: '16:9 横向' },
  { value: '9:16', label: '9:16 竖向' },
  { value: '4:3', label: '4:3 横向' },
  { value: '3:4', label: '3:4 竖向' },
  { value: '21:9', label: '21:9 超宽' },
]

const image2SizeOptions: Record<string, Array<{ value: string; label: string; size: string }>> = {
  '1K': [
    { value: '1:1', label: '1:1 方形 · 1024×1024', size: '1024x1024' },
    { value: '3:2', label: '3:2 横图 · 1024×688', size: '1024x688' },
    { value: '2:3', label: '2:3 竖图 · 688×1024', size: '688x1024' },
    { value: '4:3', label: '4:3 横图 · 1024×768', size: '1024x768' },
    { value: '3:4', label: '3:4 竖图 · 768×1024', size: '768x1024' },
  ],
  '2K': [
    { value: '1:1', label: '1:1 方形 · 2048×2048', size: '2048x2048' },
    { value: '3:2', label: '3:2 横图 · 2048×1360', size: '2048x1360' },
    { value: '2:3', label: '2:3 竖图 · 1360×2048', size: '1360x2048' },
    { value: '16:9', label: '16:9 横图 · 2048×1152', size: '2048x1152' },
    { value: '9:16', label: '9:16 竖图 · 1152×2048', size: '1152x2048' },
    { value: '4:3', label: '4:3 横图 · 2048×1536', size: '2048x1536' },
    { value: '3:4', label: '3:4 竖图 · 1536×2048', size: '1536x2048' },
    { value: '21:9', label: '21:9 超宽 · 2048×880', size: '2048x880' },
  ],
  '4K': [
    { value: '1:1', label: '1:1 方形 · 2880×2880', size: '2880x2880' },
    { value: '3:2', label: '3:2 横图 · 3520×2352', size: '3520x2352' },
    { value: '2:3', label: '2:3 竖图 · 2352×3520', size: '2352x3520' },
    { value: '16:9', label: '16:9 横图 · 3840×2160', size: '3840x2160' },
    { value: '9:16', label: '9:16 竖图 · 2160×3840', size: '2160x3840' },
    { value: '4:3', label: '4:3 横图 · 3312×2496', size: '3312x2496' },
    { value: '3:4', label: '3:4 竖图 · 2496×3312', size: '2496x3312' },
    { value: '21:9', label: '21:9 超宽 · 3840×1648', size: '3840x1648' },
  ],
}

const imageSizeModes: Array<{ value: ImageSizeMode; label: string }> = [
  { value: 'auto', label: '自动' },
  { value: 'ratio', label: '按比例' },
  { value: 'custom', label: '自定义宽高' },
]

const appStore = useAppStore()
const studioMode = ref<StudioMode>('image')
const historyFilter = ref<StudioMode>('image')
const imageCapability = ref<ImageCapability>('image2')
const videoCapability = ref<VideoCapability>('seedance')
const historyCollapsed = ref(false)
// Below 1120px the history column is hidden; the panel opens as a drawer instead.
const compactHistory = useMediaQuery('(max-width: 1120px)')
const phoneHistory = useMediaQuery('(max-width: 800px)')
const historyDrawerOpen = ref(false)
const historyDragOffset = ref(0)
const historyToggleElement = ref<HTMLElement | null>(null)
const historyCloseElement = ref<HTMLElement | null>(null)
const historyListHidden = computed(() => historyCollapsed.value && !compactHistory.value)
const bodyScrollLocked = useScrollLock(typeof document === 'undefined' ? null : document.body)
const groups = ref<Group[]>([])
const apiKeys = ref<ApiKey[]>([])
const selectedGroupId = ref(0)
const modelOptions = ref<string[]>([])
const selectedModel = ref('')
const prompt = ref('')
const referenceImages = ref<ReferenceImage[]>([])
const aspectRatio = ref('1:1')
const imageResolution = ref('1K')
const imageSizeMode = ref<ImageSizeMode>('auto')
const imageCustomWidth = ref(1024)
const imageCustomHeight = ref(1024)
const imageSizeDialogOpen = ref(false)
const videoParamsDialogOpen = ref(false)
const videoAspectDraft = ref('16:9')
const videoFollowSourceDraft = ref(true)
const videoResolutionDraft = ref('720p')
const imageSizeDraftMode = ref<ImageSizeMode>('ratio')
const imageSizeDraftResolution = ref('1K')
const imageSizeDraftRatio = ref('1:1')
const imageSizeDraftWidth = ref(1024)
const imageSizeDraftHeight = ref(1024)
const videoResolution = ref('720p')
const videoGenerationMethod = ref<VideoGenerationMethod>('text')
const videoFollowSourceAspect = ref(true)
const imageQuality = ref('auto')
const outputFormat = ref('png')
// GPT Image 2.6 GIF output (official guide): 2–16 frames, default 9; 20–2000ms per frame
// rounded to 10ms, default 200. `size` is per frame and all frames share one request pixel
// budget, so a 4K frame size cannot fit; GIF defaults to size "auto".
const GIF_FRAME_COUNT_RANGE = { min: 2, max: 16, fallback: 9, step: 1 }
const GIF_FRAME_DURATION_RANGE = { min: 20, max: 2000, fallback: 200, step: 10 }
const gifFrameCount = ref(GIF_FRAME_COUNT_RANGE.fallback)
const gifFrameDurationMs = ref(GIF_FRAME_DURATION_RANGE.fallback)
function clampGifSetting(value: unknown, range: { min: number; max: number; fallback: number; step: number }) {
  const number = Math.round(Number(value) / range.step) * range.step
  return Number.isFinite(number) && number > 0 ? Math.min(range.max, Math.max(range.min, number)) : range.fallback
}
watch(outputFormat, (format, previous) => {
  if (format === 'gif' && previous !== 'gif' && imageCapability.value === 'image2') imageSizeMode.value = 'auto'
})
// SVG output is generations-only; the edits endpoint (used with reference images) cannot return it.
watch(() => referenceImages.value.length, count => {
  if (count > 0 && outputFormat.value === 'svg') {
    outputFormat.value = 'png'
    // Reusing a work includes the format change in its success notification.
    if (!referencingOutputKey.value) appStore.showWarning('SVG 输出不支持参考图，已切换为 PNG')
  }
})
const outputCount = ref(1)
const videoDuration = ref(8)
const professionalVideo = ref(false)
const videoShots = ref<VideoShot[]>([{
  id: crypto.randomUUID(),
  prompt: '',
  duration: 8,
  generationMethod: 'text',
  referenceImages: [],
  aspectRatio: '16:9',
  followSourceAspect: true,
  resolution: '720p',
}])
const selectedShotId = ref(videoShots.value[0].id)
const historyItems = ref<CreatorHistoryItem[]>([])
const selectedWork = ref<CreatorHistoryItem | null>(null)
const promptExpanded = ref(false)
watch(() => selectedWork.value?.id, () => { promptExpanded.value = false })
const localSaveWarning = ref('')
const imageDownloads = new Map<string, Promise<Blob>>()
const historicalImageSaves = new Map<string, Promise<void>>()
let historicalImageRecoveryRunning = false
const referencingOutputKey = ref('')
const downloadingOutputKey = ref('')
const activeTemplateIndex = ref(0)
const briefPromptElement = ref<HTMLElement | null>(null)
const briefPromptClipped = ref(false)
const briefBodyElement = ref<HTMLElement | null>(null)
const briefBodyHeight = ref(0)
const bootstrapping = ref(false)
const loadingModels = ref(false)
const creatingKey = ref(false)
const processingReferenceImages = ref(false)
const regeneratingWorkId = ref('')
interface GenerationTask {
  id: string
  mode: StudioMode
  prompt: string
  phase: GenerationPhase
  hasExactProgress: boolean
  percent: number
  progress: string
  startedAt: number
  /** Images of this task that failed; their frames are marked instead of drawing. */
  failedCount?: number
  /** Video shots that finished; indexed by original shot number. */
  shotOutputs?: Map<number, string>
  /** Video shots that failed upstream (not download interruptions). */
  failedShots?: Set<number>
}
// Each request owns its state and immutable inputs. Browsing or starting another
// creation only changes the selection, never the request that is already running.
const activeGenerations = reactive(new Map<string, GenerationTask>())
const selectedGeneration = computed(() => selectedWork.value ? activeGenerations.get(selectedWork.value.id) : undefined)
const activeGenerationCounts = computed(() => {
  const counts: Record<StudioMode, number> = { image: 0, video: 0 }
  for (const task of activeGenerations.values()) counts[task.mode]++
  return counts
})
const generationMode = computed(() => selectedGeneration.value?.mode)
const generationPhase = computed(() => selectedGeneration.value?.phase)
const generationProgress = computed(() => selectedGeneration.value?.progress)
const generationHasExactProgress = computed(() => selectedGeneration.value?.hasExactProgress)
const generationPercent = computed(() => selectedGeneration.value?.percent || 0)
const generationStartedAt = computed(() => selectedGeneration.value?.startedAt || 0)
const modeSelections: Record<StudioMode, string | null> = { image: null, video: null }
const generationClock = ref(Date.now())
const checkingVideoHistory = ref(false)
const videoHistoryFeedback = ref<{ workId: string; tone: 'pending' | 'error'; message: string } | null>(null)
const loadingVideoWorkId = ref('')
const composingWorkId = ref('')
const previewUrl = ref('')
const previewOutputs = computed(() => selectedWork.value?.outputs ?? [])
const previewIndex = computed(() => previewOutputs.value.indexOf(previewUrl.value))
const previewImageCacheKey = computed(() => {
  const work = selectedWork.value
  const index = previewIndex.value
  return work && index >= 0 ? `${work.id}:${work.updatedAt}:${index}` : undefined
})

function openPreview(output: string) {
  previewUrl.value = output
}

function closePreview() {
  previewUrl.value = ''
}

async function editPreviewOutput() {
  const work = selectedWork.value
  const index = previewIndex.value
  if (!work || index < 0) return
  const output = previewUrl.value
  closePreview()
  await useOutputAsReference(output, work, index)
}

function stepPreview(direction: 1 | -1) {
  const outputs = previewOutputs.value
  if (outputs.length < 2) return
  const current = previewIndex.value
  const start = current >= 0 ? current : direction > 0 ? -1 : 0
  previewUrl.value = outputs[(start + direction + outputs.length) % outputs.length]
}

function handlePreviewKeydown(event: KeyboardEvent) {
  if (!previewUrl.value || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closePreview()
    return
  }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    if (previewOutputs.value.length < 2) return
    event.preventDefault()
    stepPreview(event.key === 'ArrowRight' ? 1 : -1)
  }
}
const promptToolExpanded = ref(false)
const promptTemplatePage = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
let modelRequestSequence = 0
let referenceUploadSequence = 0
let disposed = false
let unsubscribeHistory: (() => void) | undefined
let unsubscribeExternalHistory: (() => void) | undefined
let externalHistoryQueue: Promise<void> = Promise.resolve()
const studioElement = ref<HTMLElement | null>(null)
const toolbarElement = ref<HTMLElement | null>(null)
// The toolbar is sticky on mobile; square its corners once it pins below the site header.
const toolbarStuck = ref(false)
let toolbarStuckFrame = 0
function updateToolbarStuck() {
  toolbarStuckFrame = 0
  const studio = studioElement.value
  const toolbar = toolbarElement.value
  if (!studio || !toolbar) return
  // At rest the toolbar sits just inside the card's top border; any further offset means sticky pinned it.
  toolbarStuck.value = toolbar.getBoundingClientRect().top - studio.getBoundingClientRect().top - studio.clientTop > 0.5
}
function scheduleToolbarStuck() {
  if (!toolbarStuckFrame) toolbarStuckFrame = requestAnimationFrame(updateToolbarStuck)
}
const canvasPanelElement = ref<HTMLElement | null>(null)
const settingsScrollElement = ref<HTMLElement | null>(null)
const settingsPanelElement = ref<HTMLElement | null>(null)
let studioActive = true
let generationTimer: number | undefined
let templateAutoplayTimer: number | undefined
let restoreSettingsSequence = 0
const restoringWorkSettings = ref(false)
const transientObjectUrls = new Set<string>()
const blobObjectUrls = new WeakMap<Blob, string>()

const activeTemplates = computed(() => studioMode.value === 'image' ? imageTemplates : videoTemplates)
const activeTemplate = computed(() => activeTemplates.value[activeTemplateIndex.value] || activeTemplates.value[0])
const activePromptCategories = computed(() => studioMode.value === 'image' ? imagePromptCategories : videoPromptCategories)
const selectedVideoHistoryFeedback = computed(() => (
  videoHistoryFeedback.value?.workId === selectedWork.value?.id ? videoHistoryFeedback.value : null
))
const promptTemplatePageSize = 6
const promptTemplatePageCount = computed(() => Math.max(1, Math.ceil(activeTemplates.value.length / promptTemplatePageSize)))
const visiblePromptTemplates = computed(() => {
  const start = promptTemplatePage.value * promptTemplatePageSize
  return activeTemplates.value.slice(start, start + promptTemplatePageSize)
})
const promptLimit = computed(() => {
  if (imageCapability.value === 'image2' && studioMode.value === 'image') return 32000
  return studioMode.value === 'video' && isMiniMaxH3Model(selectedModel.value) ? 7000 : 8000
})
const promptPlaceholder = computed(() => studioMode.value === 'image'
  ? '例如：一间被午后阳光照亮的日式书房，木质书桌，窗边绿植，安静、真实、电影感'
  : '例如：镜头从海面低机位缓慢向前推进，晨光穿过薄雾，浪花在前景闪烁')
const imageResolutionOptions = computed(() => {
  if (imageCapability.value === 'banner') return ['1K', '2K', '4K']
  if (imageCapability.value === 'image2') {
    return image2StandardModel() ? ['1K', '2K', '4K'] : ['1K', '2K']
  }
  return ['1K', '2K']
})
const videoSupports1080p = computed(() => /grok-imagine-video-1\.5(?:$|-)/i.test(selectedModel.value))
// Relay model IDs (MiniMax H3, Seedance) fix the resolution and the
// allowed duration range, and share the same aspect ratios and image limit.
const selectedVideoRelayTier = computed(() => studioMode.value === 'video'
  ? miniMaxH3Tier(selectedModel.value) || seedanceVideoTier(selectedModel.value)
  : null)
const videoResolutionOptions = computed(() => {
  if (selectedVideoRelayTier.value) return [selectedVideoRelayTier.value.resolution]
  return videoSupports1080p.value ? ['480p', '720p', '1080p'] : ['480p', '720p']
})
const videoDurationRange = computed(() => selectedVideoRelayTier.value
  ? { min: selectedVideoRelayTier.value.minSeconds, max: selectedVideoRelayTier.value.maxSeconds }
  : { min: 1, max: 15 })
const selectedSeedanceTier = computed(() => studioMode.value === 'video' ? seedanceVideoTier(selectedModel.value) : null)
const selectedMiniMaxTierHint = computed(() => studioMode.value === 'video'
  ? miniMaxH3Tier(selectedModel.value)?.label.split(' · ').slice(1).join(' · ') || ''
  : '')
const videoAspectRatios = computed(() => selectedVideoRelayTier.value
  ? selectedVideoRelayTier.value.aspectRatios || MINIMAX_H3_ASPECT_RATIOS
  : GROK_VIDEO_ASPECT_RATIOS)
// Grok lists its unsupported ratios (21:9) disabled; relay tiers list only their own.
const videoAspectChoices = computed(() => selectedVideoRelayTier.value
  ? videoAspectOptions.filter(option => videoAspectRatios.value.includes(option.value))
  : videoAspectOptions)
const referenceVideoImageLimit = computed(() => selectedVideoRelayTier.value
  ? selectedSeedanceTier.value?.maxReferenceImages || MINIMAX_H3_MAX_REFERENCE_IMAGES
  : 7)
// Text-only Seedance lines refuse reference images.
const relayTierAcceptsUploads = computed(() => selectedSeedanceTier.value?.supportsUploadedReferences ?? true)
const relayTierRequiresReference = computed(() => Boolean(studioMode.value === 'video' && miniMaxH3Tier(selectedModel.value)?.requiresReference))
const aspectOptions = computed(() => {
  if (studioMode.value === 'image') {
    return image2SizeOptions[imageResolution.value] || image2SizeOptions['1K']
  }
  return defaultAspectOptions
})
const imageDialogRatioOptions = image2RatioOptions
const imageSizeTriggerLabel = computed(() => {
  if (imageCapability.value === 'image2' && imageSizeMode.value === 'auto') return '自动'
  const size = sizeForImage().replace('x', '×')
  return imageCapability.value === 'image2' && imageSizeMode.value === 'custom' ? `自定义 · ${size}` : `${imageResolution.value} · ${size}`
})
const imageSizeDraftResult = computed(() => {
  if (imageSizeDraftMode.value === 'auto') return 'auto'
  if (imageSizeDraftMode.value === 'custom') {
    const [width, height] = normalizeCustomImageSize(imageSizeDraftWidth.value, imageSizeDraftHeight.value)
    return `${width}x${height}`
  }
  return image2SizeFor(imageSizeDraftResolution.value, imageSizeDraftRatio.value)
})
const selectedShotIndex = computed(() => Math.max(0, videoShots.value.findIndex(shot => shot.id === selectedShotId.value)))
const selectedShot = computed(() => videoShots.value[selectedShotIndex.value] || videoShots.value[0] || null)
const activeVideoGenerationMethod = computed<VideoGenerationMethod>({
  get: () => professionalVideo.value
    ? selectedShot.value?.generationMethod || 'text'
    : videoGenerationMethod.value,
  set: value => {
    if (professionalVideo.value && selectedShot.value) selectedShot.value.generationMethod = value
    else videoGenerationMethod.value = value
  },
})
const activeVideoAspectRatio = computed({
  get: () => professionalVideo.value
    ? selectedShot.value?.aspectRatio || '16:9'
    : aspectRatio.value,
  set: value => {
    if (professionalVideo.value && selectedShot.value) selectedShot.value.aspectRatio = value
    else aspectRatio.value = value
  },
})
const activeVideoFollowSourceAspect = computed({
  get: () => professionalVideo.value
    ? selectedShot.value?.followSourceAspect ?? true
    : videoFollowSourceAspect.value,
  set: value => {
    if (professionalVideo.value && selectedShot.value) selectedShot.value.followSourceAspect = value
    else videoFollowSourceAspect.value = value
  },
})
// xAI ignores aspect_ratio for image-to-video and keeps the source image's shape.
// Users can keep that default or have the source cropped to a chosen ratio.
const videoUsesSourceImage = computed(() => activeVideoGenerationMethod.value === 'image' && activeReferenceImages.value.length > 0)
const videoAspectFollowsSource = computed(() => videoUsesSourceImage.value && activeVideoFollowSourceAspect.value)
const videoAspectDraftFollowsSource = computed(() => videoUsesSourceImage.value && videoFollowSourceDraft.value)
const activeVideoResolution = computed({
  get: () => professionalVideo.value
    ? selectedShot.value?.resolution || '720p'
    : videoResolution.value,
  set: value => {
    if (professionalVideo.value && selectedShot.value) selectedShot.value.resolution = value
    else videoResolution.value = value
  },
})
const activeReferenceImages = computed<ReferenceImage[]>({
  get: () => studioMode.value === 'video' && professionalVideo.value
    ? selectedShot.value?.referenceImages || []
    : referenceImages.value,
  set: value => {
    if (studioMode.value === 'video' && professionalVideo.value && selectedShot.value) {
      selectedShot.value.referenceImages = value
    } else {
      referenceImages.value = value
    }
  },
})
const maxReferenceImages = computed(() => {
  if (studioMode.value === 'video') {
    if (activeVideoGenerationMethod.value === 'text') return 0
    return activeVideoGenerationMethod.value === 'image' ? 1 : referenceVideoImageLimit.value
  }
  if (imageCapability.value === 'image2') return 16
  return 3
})
// GPT Image 2.6 SVG output only allows n=1.
const maxOutputCount = computed(() => (imageCapability.value === 'image2' && outputFormat.value === 'svg') || isSingleOutputImageModel(selectedModel.value, imageResolution.value, imageCapability.value) ? 1 : 4)
const referenceFieldVisible = computed(() => studioMode.value === 'image' || activeVideoGenerationMethod.value !== 'text')
const referenceFieldLabel = computed(() => studioMode.value === 'video' && activeVideoGenerationMethod.value === 'image' ? '源图' : '参考图')
const referenceHint = computed(() => {
  if (studioMode.value === 'video' && activeVideoGenerationMethod.value === 'image') return '必选，仅 1 张，作为当前镜头首帧'
  if (studioMode.value === 'video') return `必选，最多 ${referenceVideoImageLimit.value} 张`
  return `可选，最多 ${maxReferenceImages.value} 张`
})
const referenceUploadDescription = computed(() => {
  const usage = studioMode.value === 'video' && activeVideoGenerationMethod.value === 'image'
    ? professionalVideo.value ? '仅用于当前镜头首帧' : '将作为视频首帧'
    : studioMode.value === 'video'
      ? '用于保持主体和风格一致'
      : ''
  const limits = studioMode.value === 'video'
    ? `原图 ≤ ${MAX_VIDEO_REFERENCE_SOURCE_MB}MB · 自动缩至长边 ≤ 2048px / 3MB · 合计 ≤ ${MAX_VIDEO_REFERENCE_TOTAL_MB}MB`
    : `单张不超过 ${MAX_REFERENCE_IMAGE_SIZE_MB}MB`
  return ['PNG / JPG / WEBP', limits, usage].filter(Boolean).join(' · ')
})
const selectedGroup = computed(() => groups.value.find(group => group.id === selectedGroupId.value) || null)
const selectedApiKey = computed(() => apiKeys.value.find(key => key.status === 'active' && key.group_id === selectedGroupId.value) || null)
const availableGroups = computed(() => groups.value.filter(group => groupMatchesCurrentCapability(group)))
const imagePricing = ref<CreatorImagePricing | null>(null)
const imagePricingLoading = ref(false)
const imagePricingFailed = ref(false)
let imagePricingRequest: AbortController | null = null
const imageBillingTier = computed(() => {
  if (imageCapability.value !== 'image2') return imageResolution.value
  const size = sizeForImage()
  if (size === 'auto') return ''
  const [width, height] = size.split('x').map(Number)
  return customImageResolution(width, height)
})
function imageTierPriceLabel(tier: string) {
  const price = imagePricing.value?.prices[tier]
  return price != null ? `${formatScaled(price, 1, 2)}/张` : '价格待确认'
}
const imageEstimatedCost = computed(() => {
  if (imagePricingLoading.value) return '正在查询…'
  if (!imagePricing.value) return '暂无法预估'
  if (imagePricing.value.billing_mode === 'token') return '按实际用量计费'
  const prices = imagePricing.value.prices
  if (imageBillingTier.value) {
    const price = prices[imageBillingTier.value]
    return price == null ? '暂无法预估' : formatScaled(price, outputCount.value, 2)
  }
  const values = imageResolutionOptions.value.map(tier => prices[tier]).filter((price): price is number => price != null)
  if (!values.length) return '暂无法预估'
  const low = Math.min(...values), high = Math.max(...values)
  return low === high ? formatScaled(low, outputCount.value, 2) : `${formatScaled(low, outputCount.value, 2)}–${formatScaled(high, outputCount.value, 2)}`
})
const imagePricingNote = computed(() => {
  if (imagePricingLoading.value) return '正在获取价格'
  if (!imagePricing.value) return '价格暂未获取'
  if (imagePricing.value.billing_mode === 'token') return '按实际 Token 用量结算'
  if (!imageBillingTier.value) return `自动尺寸 · ${outputCount.value} 张 · 按输出尺寸结算`
  if (imageCapability.value === 'grok') return `${imageBillingTier.value} · ${imageTierPriceLabel(imageBillingTier.value)} × ${outputCount.value} 张 · 按所选档位结算`
  return `${imageBillingTier.value} · ${imageTierPriceLabel(imageBillingTier.value)} × ${outputCount.value} 张 · 预估，按实际输出与用量结算`
})
async function loadImagePricing() {
  imagePricingRequest?.abort()
  const request = new AbortController()
  imagePricingRequest = request
  imagePricing.value = null
  imagePricingFailed.value = false
  imagePricingLoading.value = false
  if (studioMode.value !== 'image' || !selectedApiKey.value || !selectedModel.value) return
  imagePricingLoading.value = true
  try {
    const quote = await getCreatorImagePricing(selectedApiKey.value.key, imageModelForGeneration(), request.signal)
    if (imagePricingRequest !== request) return
    imagePricing.value = quote
  } catch {
    if (imagePricingRequest === request) imagePricingFailed.value = true
  } finally {
    if (imagePricingRequest === request) imagePricingLoading.value = false
  }
}
const imageHistoryCount = computed(() => historyItems.value.filter(item => item.type === 'image').length)
const videoHistoryCount = computed(() => historyItems.value.filter(item => item.type === 'video').length)
const visibleHistory = computed(() => historyItems.value.filter(item => item.type === historyFilter.value))
const historyListElement = ref<HTMLElement | null>(null)
const virtualizeHistory = computed(() => visibleHistory.value.length > 20)
const historyVirtualizer = useVirtualizer<HTMLElement, HTMLElement>(computed(() => ({
  enabled: virtualizeHistory.value && !historyListHidden.value,
  count: virtualizeHistory.value ? visibleHistory.value.length : 0,
  getScrollElement: () => historyListElement.value,
  getItemKey: (index: number) => visibleHistory.value[index].id,
  estimateSize: () => 78,
  overscan: 3,
  initialRect: { width: 0, height: 600 },
  observeElementRect: (instance, callback) => observeElementRect(instance, rect => {
    if (rect.height > 0) callback(rect)
  }),
})))
const historyVirtualRows = computed(() => historyVirtualizer.value.getVirtualItems())
const renderedHistory = computed(() => virtualizeHistory.value
  ? historyVirtualRows.value.map(row => visibleHistory.value[row.index])
  : visibleHistory.value)
const historyPaddingTop = computed(() => virtualizeHistory.value ? historyVirtualRows.value[0]?.start || 0 : 0)
const historyPaddingBottom = computed(() => virtualizeHistory.value
  ? Math.max(0, historyVirtualizer.value.getTotalSize() - (historyVirtualRows.value.at(-1)?.end || 0))
  : 0)
watch(historyFilter, () => {
  historyVirtualizer.value.scrollToOffset(0)
}, { flush: 'post' })
const totalShotDuration = computed(() => videoShots.value.reduce((sum, shot) => sum + Number(shot.duration || 0), 0))
const editorPrompt = computed({
  get: () => studioMode.value === 'video' && professionalVideo.value
    ? selectedShot.value?.prompt || ''
    : prompt.value,
  set: (value: string) => {
    if (studioMode.value === 'video' && professionalVideo.value && selectedShot.value) {
      selectedShot.value.prompt = value
      return
    }
    prompt.value = value
  },
})
const configuredVideoDuration = computed({
  get: () => professionalVideo.value
    ? Number(selectedShot.value?.duration || 0)
    : videoDuration.value,
  set: (value: number) => {
    const next = Math.max(videoDurationRange.value.min, Math.min(videoDurationRange.value.max, value))
    if (professionalVideo.value && selectedShot.value) {
      selectedShot.value.duration = next
      return
    }
    videoDuration.value = next
  },
})
const estimatedVideoDuration = computed(() => professionalVideo.value ? totalShotDuration.value : videoDuration.value)
const videoPricing = ref<CreatorVideoPricing | null>(null)
const videoPricingLoading = ref(false)
const videoPricingFailed = ref(false)
let videoPricingRequest: AbortController | null = null
const videoEstimatedAmount = computed(() => {
  if (!videoPricing.value) return null
  const shots = professionalVideo.value
    ? videoShots.value
    : [{ resolution: videoResolution.value, duration: videoDuration.value }]
  if (!shots.length) return null
  let total = 0
  for (const shot of shots) {
    const cost = videoPricing.value.prices[shot.resolution]?.[Number(shot.duration) - 1]
    if (cost == null || !Number.isFinite(cost)) return null
    total += cost
  }
  return total
})
const videoEstimatedCost = computed(() => {
  if (videoPricingLoading.value) return '正在查询…'
  return videoEstimatedAmount.value == null ? '暂无法预估' : formatScaled(videoEstimatedAmount.value, 1, 2)
})
const videoPricingNote = computed(() => {
  if (videoPricingLoading.value) return '正在获取价格'
  if (videoEstimatedAmount.value == null) return '价格暂未获取'
  return professionalVideo.value
    ? '按各镜头清晰度汇总 · 已计入当前适用倍率'
    : `${videoResolution.value} · 已计入当前适用倍率`
})
// Price of one shot at the current (or selected shot's) duration.
function videoShotPrice(resolution: string, duration: number) {
  const cost = videoPricing.value?.prices[resolution]?.[Number(duration) - 1]
  return cost != null && Number.isFinite(cost) ? cost : null
}
function videoResolutionPriceLabel(resolution: string) {
  if (videoPricingLoading.value) return '正在查询…'
  const cost = videoShotPrice(resolution, configuredVideoDuration.value)
  return cost == null ? '价格待确认' : `${formatScaled(cost, 1, 2)} / ${configuredVideoDuration.value} 秒`
}
// Dialog quote: in the professional workspace only the selected shot changes,
// so the total keeps the other shots' saved resolutions.
const videoParamsDraftAmount = computed(() => {
  if (!videoPricing.value) return null
  const shots = professionalVideo.value
    ? videoShots.value.map(shot => shot.id === selectedShot.value?.id ? { ...shot, resolution: videoResolutionDraft.value } : shot)
    : [{ resolution: videoResolutionDraft.value, duration: videoDuration.value }]
  if (!shots.length) return null
  let total = 0
  for (const shot of shots) {
    const cost = videoShotPrice(shot.resolution, shot.duration)
    if (cost == null) return null
    total += cost
  }
  return total
})
const videoParamsDraftCost = computed(() => {
  if (videoPricingLoading.value) return '正在查询…'
  return videoParamsDraftAmount.value == null ? '暂无法预估' : `${formatScaled(videoParamsDraftAmount.value, 1, 2)} USD`
})
const videoParamsCostNote = computed(() => professionalVideo.value
  ? `预计费用 · ${videoShots.value.length} 个镜头 · 共 ${estimatedVideoDuration.value} 秒`
  : `预计费用 · ${videoResolutionDraft.value} · ${videoDuration.value} 秒`)
async function loadVideoPricing() {
  videoPricingRequest?.abort()
  const request = new AbortController()
  videoPricingRequest = request
  videoPricing.value = null
  videoPricingFailed.value = false
  videoPricingLoading.value = false
  if (studioMode.value !== 'video' || !selectedApiKey.value || !selectedModel.value) return
  videoPricingLoading.value = true
  try {
    const quote = await getCreatorVideoPricing(selectedApiKey.value.key, selectedModel.value, request.signal)
    if (videoPricingRequest === request) videoPricing.value = quote
  } catch {
    if (videoPricingRequest === request) videoPricingFailed.value = true
  } finally {
    if (videoPricingRequest === request) videoPricingLoading.value = false
  }
}
const estimatedVideoMode = computed(() => professionalVideo.value && videoShots.value.length > 1 ? `${videoShots.value.length} 个镜头 · 按镜头顺序拼接` : '单段视频')
const effectivePrompt = computed(() => {
  if (studioMode.value === 'video' && professionalVideo.value) {
    return videoShots.value[0]?.prompt.trim() || ''
  }
  return prompt.value.trim()
})
const referenceVideoModelOptions = computed(() => modelOptions.value.filter(supportsReferenceVideo))
const requiresReferenceVideo15 = computed(() => (
  studioMode.value === 'video'
  && (professionalVideo.value
    ? videoShots.value.some(shot => shot.generationMethod === 'reference')
    : videoGenerationMethod.value === 'reference')
))
const selectableModelOptions = computed(() => (
  requiresReferenceVideo15.value
    ? referenceVideoModelOptions.value
    : modelOptions.value
))
const referenceVideoModelUnavailable = computed(() => (
  requiresReferenceVideo15.value
  && !loadingModels.value
  && referenceVideoModelOptions.value.length === 0
))
const canGenerate = computed(() => {
  if (selectedGeneration.value || loadingModels.value || restoringWorkSettings.value || processingReferenceImages.value || !selectedApiKey.value || !selectedModel.value || !effectivePrompt.value || effectivePrompt.value.length > promptLimit.value) return false
  if (requiresReferenceVideo15.value && !supportsReferenceVideo(selectedModel.value)) return false
  if (studioMode.value === 'video' && professionalVideo.value) {
    return totalShotDuration.value <= 60
      && videoShots.value.length > 0
      && videoShots.value.every(shot => (
        shot.prompt.trim()
        && shot.prompt.length <= promptLimit.value
        && (shot.generationMethod === 'text' || shot.referenceImages.length > 0)
      ))
  }
  if (studioMode.value === 'video' && videoGenerationMethod.value !== 'text' && !referenceImages.value.length) return false
  return true
})
const professionalVideoReferenceError = computed(() => {
  if (studioMode.value !== 'video' || !professionalVideo.value) return ''
  const index = videoShots.value.findIndex(shot => shot.generationMethod !== 'text' && !shot.referenceImages.length)
  if (index < 0) return ''
  return videoShots.value[index].generationMethod === 'image'
    ? `镜头 ${index + 1} 的图生视频需要 1 张源图`
    : `镜头 ${index + 1} 的参考图生视频至少需要 1 张参考图`
})
// One placeholder per requested image or video shot, shaped like the requested ratio, so
// finished items appear in place while the others are still drawing.
const generationFrames = computed(() => {
  const work = selectedWork.value
  const task = selectedGeneration.value
  if (!work || !task) return []
  if (work.type === 'image') {
    const count = Math.max(1, work.outputCount || 1)
    const failedFrom = count - (task.failedCount || 0)
    return Array.from({ length: count }, (_, index) => {
      const output = work.outputs[index]
      // All remaining images are requested at once, so every empty frame is drawing.
      const state = output ? 'done' : index >= failedFrom ? 'failed' : 'current'
      return { index, output, state }
    })
  }
  // Video: one frame per shot, showing finished shots immediately.
  const shotCount = work.shotCount || 1
  if (shotCount === 1) {
    return [{ index: 0, output: work.outputs[0], state: work.outputs[0] ? 'done' : 'current' }]
  }
  return Array.from({ length: shotCount }, (_, index) => {
    const output = task.shotOutputs?.get(index)
    const state = output ? 'done' : task.failedShots?.has(index) ? 'failed' : 'current'
    return { index, output, state }
  })
})
// Video shots wrap after two per row; images use the same cap on mobile.
const generationColumns = computed(() => {
  const count = generationFrames.value.length || 1
  return generationMode.value === 'video' ? Math.min(count, 2) : count
})
const generationStageStyle = computed(() => ({
  '--generation-columns': generationColumns.value,
  '--generation-mobile-columns': Math.min(generationFrames.value.length || 1, 2),
}))
const generationFrameStyle = computed(() => {
  const [ratioWidth, ratioHeight] = (selectedWork.value?.aspectRatio || '').split(':').map(Number)
  const width = ratioWidth > 0 ? ratioWidth : 1
  const height = ratioHeight > 0 ? ratioHeight : 1
  const count = generationFrames.value.length || 1
  const columns = generationColumns.value
  const rows = Math.ceil(count / columns)
  const ratio = Math.round((width / height) * 10000) / 10000
  const singleImage = generationMode.value === 'image' && count === 1
  // Row width and frame height come from CSS so the frames scale with the canvas.
  // Single frames fill the available row so their side gaps match the workspace;
  // multiple frames share the row with 12px gaps.
  const share = count === 1
    ? 'var(--generation-row-width)'
    : `(var(--generation-row-width) - ${12 * (columns - 1)}px) / ${columns}`
  // Wrapped rows split the frame height so the whole grid stays about one frame tall.
  // A single portrait image is capped at 72vh so it stays on screen.
  const frameHeight = rows === 1
    ? (singleImage ? 'min(var(--generation-frame-height), 72vh)' : 'var(--generation-frame-height)')
    : `max(140px, (var(--generation-frame-height) - ${12 * (rows - 1)}px) / ${rows})`
  // Landscape and square single images are not height-capped; the canvas scrolls instead.
  const frameWidth = singleImage && ratio >= 1
    ? `calc(${share})`
    : `min(calc(${share}), calc(${frameHeight} * ${ratio}))`
  return {
    '--generation-frame-width': frameWidth,
    '--generation-frame-height-ring-size': `${50 * height / width}cqi`,
    // Desktop video placeholders fill the available canvas; media stays contained.
    aspectRatio: generationMode.value === 'image' ? `${width} / ${height}` : undefined,
    '--generation-frame-aspect-ratio': `${width} / ${height}`,
    // Mobile frames stretch to the gutter; cap each at 480px tall so portrait ratios stay on screen.
    '--generation-frame-mobile-max': `${Math.round((width / height) * 480)}px`,
  }
})
const generationElapsedLabel = computed(() => {
  const elapsedSeconds = generationStartedAt.value
    ? Math.max(0, Math.floor((generationClock.value - generationStartedAt.value) / 1000))
    : 0
  const minutes = Math.floor(elapsedSeconds / 60)
  const seconds = elapsedSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

function groupMatchesCurrentCapability(group: Group) {
  if (group.status !== 'active') return false
  const haystack = `${group.name} ${group.description || ''}`.toLowerCase()
  if (studioMode.value === 'video') {
    // Relay groups only create video once their family price is set:
    // H3 on MiniMax groups, Seedance on DeepSeek groups.
    if (videoCapability.value === 'minimax') {
      return group.platform === 'minimax' && Object.keys(group.video_model_prices?.['minimax-h3'] || {}).length > 0
    }
    if (videoCapability.value === 'seedance') {
      return group.platform === 'deepseek' && Object.keys(group.video_model_prices?.[SEEDANCE_VIDEO_PRICE_FAMILY] || {}).length > 0
    }
    return group.platform === 'grok' || (group.platform !== 'minimax' && group.platform !== 'deepseek' && /grok|xai/.test(haystack))
  }
  if (imageCapability.value === 'grok') {
    return (group.allow_image_generation && group.platform === 'grok') || /grok.*(图|image)|xai/.test(haystack)
  }
  if (imageCapability.value === 'image2') {
    return (group.allow_image_generation && group.platform === 'openai') || /image\s*2|gpt[ -]?image|原生[24]k/.test(haystack)
  }
  return group.platform === 'gemini' || group.platform === 'antigravity' || /banner|banana|香蕉/.test(haystack)
}

function fallbackModels() {
  if (studioMode.value === 'video') {
    if (videoCapability.value === 'minimax') return [...MINIMAX_H3_STUDIO_MODELS]
    if (videoCapability.value === 'seedance') return seedanceFallbackModels()
    return ['grok-imagine-video', 'grok-imagine-video-1.5']
  }
  if (imageCapability.value === 'grok') return ['grok-imagine-image', 'grok-imagine-image-quality']
  if (imageCapability.value === 'image2') return ['gpt-image-2']
  return ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image']
}

function isGrokVideo15Model(model: string) {
  return /^grok-imagine-video-1\.5(?:$|-)/i.test(model.trim().replace(/^models\//i, ''))
}

function supportsReferenceVideo(model: string) {
  return isGrokVideo15Model(model) || isMiniMaxH3Model(model) || Boolean(seedanceVideoTier(model)?.supportsUploadedReferences)
}

// Friendly names for relay IDs; other models show their ID.
function modelLabel(model: string) {
  return miniMaxH3Tier(model)?.label || seedanceVideoTier(model)?.name || model
}

function videoModelLabel(model: string) {
  return modelLabel(model).split(' · ')[0]
}

function videoResolutionTierLabel(work: CreatorHistoryItem, index?: number) {
  return workResolutionLabel(work, index).split(' · ')[0]
}

// Grok video IDs name Grok or video; other relay IDs are Seedance lines, even
// ones since dropped from the administrator's catalog (e.g. OOsd2.5 history).
function videoCapabilityForModel(model: string): VideoCapability {
  if (isMiniMaxH3Model(model)) return 'minimax'
  if (isSeedanceVideoModel(model)) return isGrokRelayVideoModel(model) ? 'grok' : 'seedance'
  return /grok|video/i.test(model) ? 'grok' : 'seedance'
}

function videoProviderLabel(model: string) {
  return { minimax: 'MiniMax H3', seedance: 'Seedance', grok: 'Grok' }[videoCapabilityForModel(model)]
}

function videoGenerationMethodLabelFor(method: VideoGenerationMethod) {
  return {
    text: '文生',
    image: '图生',
    reference: '参考图生',
  }[method]
}

function syncVideoModelForGenerationMethod() {
  if (studioMode.value !== 'video') return
  if (requiresReferenceVideo15.value) {
    if (supportsReferenceVideo(selectedModel.value) && referenceVideoModelOptions.value.includes(selectedModel.value)) return
    selectedModel.value = referenceVideoModelOptions.value.find(model => /^grok-imagine-video-1\.5$/i.test(model))
      || referenceVideoModelOptions.value[0]
      || ''
    return
  }
  if (!selectedModel.value || !modelOptions.value.includes(selectedModel.value)) {
    selectedModel.value = modelOptions.value.includes(preferredModel())
      ? preferredModel()
      : modelOptions.value[0] || ''
  }
}

function preferredModel() {
  if (studioMode.value === 'video') {
    if (videoCapability.value === 'minimax') return MINIMAX_H3_STUDIO_MODELS[0]
    return videoCapability.value === 'seedance' ? seedanceFallbackModels()[0] : 'grok-imagine-video'
  }
  if (imageCapability.value === 'grok') return 'grok-imagine-image'
  if (imageCapability.value === 'image2') return 'gpt-image-2'
  return 'gemini-3-pro-image-preview'
}

function filterModels(models: string[]) {
  const clean = Array.from(new Set(models.map(model => model.trim()).filter(Boolean)))
  if (studioMode.value === 'video') {
    // Relay groups price models one by one (Seedance and Zhongheng H3); list
    // only the ones this group sells.
    const prices = selectedGroup.value?.video_model_prices
    const relayPriced = (model: string) => !prices?.[SEEDANCE_VIDEO_PRICE_FAMILY] || model.toLowerCase() in prices[SEEDANCE_VIDEO_PRICE_FAMILY]
    if (videoCapability.value === 'minimax') {
      return clean
        .filter(model => isMiniMaxH3StudioModel(model) && (!miniMaxH3Tier(model)?.zhongheng || model.toLowerCase() in (prices?.['minimax-h3'] || {})))
        .sort((a, b) => {
          const tierA = miniMaxH3Tier(a)
          const tierB = miniMaxH3Tier(b)
          const resolutionOrder = (tier: typeof tierA) => tier?.resolution === '768p' ? 0 : 1
          return resolutionOrder(tierA) - resolutionOrder(tierB)
            || Number(Boolean(tierA?.zhongheng)) - Number(Boolean(tierB?.zhongheng))
        })
    }
    // List Seedance in catalog order, so lines of the same model stay together.
    if (videoCapability.value === 'seedance') {
      const order = seedanceCatalogModels().map(([model]) => model)
      return clean
        .filter(model => isSeedanceVideoModel(model) && !isGrokRelayVideoModel(model) && relayPriced(model))
        .sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()))
    }
    // Grok groups also sell relay Grok lines priced under the Seedance family.
    return clean.filter(model => isGrokRelayVideoModel(model)
      ? model.toLowerCase() in (prices?.[SEEDANCE_VIDEO_PRICE_FAMILY] || {})
      : /video/i.test(model) && !isMiniMaxH3Model(model) && !isSeedanceVideoModel(model))
  }
  if (imageCapability.value === 'grok') return clean.filter(model => /grok.*imag.*image|grok-imagine$/i.test(model))
  if (imageCapability.value === 'image2') {
    return clean.filter(model => /gpt.*image|image-?2/i.test(model) && !isImage2FourKModel(model))
  }
  return clean.filter(model => /image|imagen|banana/i.test(model))
}

function isImage2FourKModel(model: string) {
  return /gpt[-_]?image[-_]?2/i.test(model) && /(?:^|[-_])4k(?:$|[-_])/i.test(model)
}

function image2StandardModel() {
  return modelOptions.value.find(model => model === 'gpt-image-2')
    || modelOptions.value.find(model => !isImage2FourKModel(model))
}

function imageModelForGeneration() {
  if (imageCapability.value === 'image2' && isImage2FourKModel(selectedModel.value)) {
    return image2StandardModel() || selectedModel.value
  }
  return selectedModel.value
}

function syncSelectedGroup() {
  const options = availableGroups.value
  if (!options.some(group => group.id === selectedGroupId.value)) {
    selectedGroupId.value = options[0]?.id || 0
  }
}

async function loadModels() {
  const sequence = ++modelRequestSequence
  const key = selectedApiKey.value
  if (!key) {
    modelOptions.value = []
    selectedModel.value = ''
    loadingModels.value = false
    return
  }
  loadingModels.value = true
  try {
    // The administrator's Seedance catalog names the models and their limits;
    // without it the built-in catalog applies.
    if (studioMode.value === 'video' && (videoCapability.value === 'seedance' || videoCapability.value === 'grok')) {
      try {
        applySeedanceCatalog(await getCreatorSeedanceCatalog(key.key))
      } catch {
        // Keep the catalog already in use.
      }
    }
    const remoteModels = await listCreatorModels(key.key)
    if (sequence !== modelRequestSequence) return
    const filtered = filterModels(remoteModels.map(model => typeof model === 'string' ? model : model.id))
    const nextModels = filtered.length ? filtered : fallbackModels()
    const nextModel = nextModels.includes(preferredModel())
      ? preferredModel()
      : nextModels[0] || ''
    modelOptions.value = nextModels
    selectedModel.value = nextModel
    syncVideoModelForGenerationMethod()
  } catch (error) {
    if (sequence !== modelRequestSequence) return
    const nextModels = fallbackModels()
    const nextModel = nextModels.includes(preferredModel())
      ? preferredModel()
      : nextModels[0] || ''
    modelOptions.value = nextModels
    selectedModel.value = nextModel
    syncVideoModelForGenerationMethod()
  } finally {
    if (sequence === modelRequestSequence) loadingModels.value = false
  }
}

async function refreshStudio() {
  if (bootstrapping.value) return
  bootstrapping.value = true
  try {
    const [available, activeKeys] = await Promise.all([
      userGroupsAPI.getAvailable(),
      loadAllUserKeys(),
    ])
    groups.value = available
    apiKeys.value = activeKeys
    await syncHistory()
    syncSelectedGroup()
    await loadModels()
    void preserveHistoricalImages()
    // Image tasks keep running on the server across a refresh; reattach to
    // them without waiting for the user to open the work.
    for (const work of historyItems.value) {
      if (work.type === 'image' && work.status === 'pending' && work.imageTaskIds?.length) void resumeImageWork(work)
      if (work.type === 'video' && work.status === 'pending' && work.shotQueue
        && work.shotQueue.nextIndex < (work.shotCount || 0)) void resumeVideoShotQueue(work)
    }
  } catch (error) {
    appStore.showError(errorMessage(error, '创作中心加载失败'))
  } finally {
    bootstrapping.value = false
  }
}

function saveVideoThumbnail(work: CreatorHistoryItem, thumbnail: string) {
  const current = historyItems.value.find(item => item.id === work.id)
  if (!current || current.updatedAt !== work.updatedAt) return
  current.videoThumbnail = thumbnail
  void creatorHistory.saveVideoThumbnail(work.id, work.updatedAt, thumbnail)
}

function applyHistoryUpdate(work: CreatorHistoryItem) {
  const current = historyItems.value.find(item => item.id === work.id)
  if (current && current.updatedAt > work.updatedAt) return
  reuseLoadedVideoBlobs(work, current)
  historyItems.value = current
    ? historyItems.value.map(item => item.id === work.id ? work : item)
    : [work, ...historyItems.value]
  if (selectedWork.value?.id === work.id) {
    restorePersistedVideoOutputs(work)
    selectedWork.value = work
  }
}

function applyExternalHistoryChange(change: CreatorHistoryChange) {
  // Serialize notifications and read only the changed work, not all full-size
  // images on every progress update from another window.
  externalHistoryQueue = externalHistoryQueue.then(async () => {
    if (disposed) return
    if (change.type === 'put') {
      const work = await creatorHistory.get(change.id)
      if (!disposed && work) applyHistoryUpdate(work)
    } else {
      historyItems.value = change.type === 'clear' ? [] : historyItems.value.filter(work => work.id !== change.id)
      if (change.type === 'clear' || selectedWork.value?.id === change.id) selectedWork.value = null
    }
  }).catch(() => undefined)
}

async function syncHistory() {
  const works = [...await creatorHistory.list()]
  if (disposed) return
  const current = new Map(historyItems.value.map(work => [work.id, work]))
  // A focus/visibility refresh can race the first IndexedDB write of a task.
  for (const work of current.values()) {
    if (activeGenerations.has(work.id) && !works.some(item => item.id === work.id)) works.push(work)
  }
  historyItems.value = works.map(work => {
    const previous = current.get(work.id)
    if (previous && previous.updatedAt > work.updatedAt) return previous
    reuseLoadedVideoBlobs(work, previous)
    return work
  })
  if (selectedWork.value) {
    const latest = historyItems.value.find(work => work.id === selectedWork.value?.id)
    if (latest) restorePersistedVideoOutputs(latest)
    selectedWork.value = latest || null
  }
}

function syncVisibleHistory() {
  if (studioActive && document.visibilityState === 'visible') void syncHistory()
}

async function loadAllUserKeys() {
  // Historical video queries are allowed for expired/quota-exhausted keys.
  // Keep those credentials available for task recovery after a page refresh;
  // creation controls still select active keys only.
  const filters = { sort_by: 'created_at', sort_order: 'desc' as const }
  const firstPage = await keysAPI.list(1, 100, filters)
  if (firstPage.pages <= 1) return firstPage.items || []
  const remainingPages = await Promise.all(
    Array.from({ length: firstPage.pages - 1 }, (_, index) => keysAPI.list(index + 2, 100, filters)),
  )
  return [firstPage, ...remainingPages].flatMap(page => page.items || [])
}

async function createAndUseKey() {
  if (!selectedGroup.value || creatingKey.value) return
  creatingKey.value = true
  try {
    const group = selectedGroup.value
    const created = await keysAPI.create(`创作中心 · ${group.name}`, group.id)
    apiKeys.value = [{ ...created, group: created.group || group }, ...apiKeys.value]
    appStore.showSuccess('Key 已创建并自动启用')
    await nextTick()
    await loadModels()
  } catch (error) {
    appStore.showError(errorMessage(error, '创建 Key 失败'))
  } finally {
    creatingKey.value = false
  }
}

async function switchMode(mode: StudioMode) {
  if (studioMode.value === mode) return
  modeSelections[studioMode.value] = selectedWork.value?.id || null
  restoreSettingsSequence++
  restoringWorkSettings.value = false
  studioMode.value = mode
  historyFilter.value = mode
  activeTemplateIndex.value = 0
  selectedWork.value = null
  clearReferenceImages()
  aspectRatio.value = mode === 'image' ? '1:1' : '16:9'
  if (mode === 'video') {
    videoGenerationMethod.value = 'text'
    videoFollowSourceAspect.value = true
    selectedShotId.value = videoShots.value[0]?.id || ''
  }
  await nextTick()
  const previous = historyItems.value.find(work => work.id === modeSelections[mode])
  if (studioMode.value === mode && previous) await selectWork(previous)
}

function useTemplate(template: PromptTemplate) {
  editorPrompt.value = template.prompt
  appStore.showSuccess(`已填入「${template.title}」，请确认生成参数`)
}

// On mobile the settings sit below the canvas; take the user straight to them.
function revealSettingsOnMobile() {
  if (!window.matchMedia?.('(max-width: 800px)').matches) return
  void nextTick(() => {
    const panel = settingsPanelElement.value
    if (!panel) return
    // Land the panel's top border exactly under the pinned toolbar, measured
    // rather than a fixed scroll margin, since the toolbar height varies by device.
    panel.style.scrollMarginTop = `${settingsRevealOffset()}px`
    panel.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
    settleSettingsReveal(panel)
  })
}

function settingsRevealOffset() {
  const toolbar = toolbarElement.value
  if (!toolbar) return 0
  const top = Number.parseFloat(getComputedStyle(toolbar).top) || 0
  return top + toolbar.getBoundingClientRect().height
}

// The canvas above the settings keeps resizing while the smooth scroll runs
// (the result view swaps back to the brief and its height transitions), so
// the scroll ends a few pixels off. Once it settles, close the remaining gap.
let settingsRevealFrame = 0
let stopSettingsReveal = () => {}
function settleSettingsReveal(panel: HTMLElement) {
  stopSettingsReveal()
  // A touch or wheel means the user took over scrolling; never pull them back.
  const stop = () => {
    if (settingsRevealFrame) cancelAnimationFrame(settingsRevealFrame)
    settingsRevealFrame = 0
    window.removeEventListener('touchstart', stop)
    window.removeEventListener('wheel', stop)
  }
  stopSettingsReveal = stop
  window.addEventListener('touchstart', stop, { passive: true })
  window.addEventListener('wheel', stop, { passive: true })
  let lastTop = panel.getBoundingClientRect().top
  let stillFrames = 0
  let corrections = 0
  const deadline = performance.now() + 2000
  const step = () => {
    settingsRevealFrame = 0
    if (disposed || performance.now() > deadline) return stop()
    // Watch the panel itself, so both scrolling and layout changes above it count as motion.
    const top = panel.getBoundingClientRect().top
    stillFrames = Math.abs(top - lastTop) < 0.5 ? stillFrames + 1 : 0
    lastTop = top
    if (stillFrames >= 6) {
      const delta = top - settingsRevealOffset()
      if (Math.abs(delta) < 1 || corrections >= 3) return stop()
      corrections++
      stillFrames = 0
      window.scrollTo?.({ top: window.scrollY + delta, behavior: 'smooth' })
    }
    settingsRevealFrame = requestAnimationFrame(step)
  }
  settingsRevealFrame = requestAnimationFrame(step)
}

// Skip the prompt already in the editor so a repeat click always changes the text.
function useRandomCategoryPrompt(category: PromptCategory) {
  const candidates = category.prompts.filter(prompt => prompt !== editorPrompt.value)
  const prompt = candidates[Math.floor(Math.random() * candidates.length)] ?? category.prompts[0]
  useTemplate({ title: category.name, tag: category.name, subtitle: category.hint, prompt })
}

// Fade the brief only while text is hidden below; a permanent fade would need
// padding that leaves an uneven gap above the button once the text fits.
function updateBriefPromptClip() {
  const element = briefPromptElement.value
  briefPromptClipped.value = !!element && element.scrollTop + element.clientHeight < element.scrollHeight - 1
}

useResizeObserver(briefPromptElement, updateBriefPromptClip)

// Phones size the stage to the current brief so short briefs leave no gap; keeping the last
// height while the out-in transition swaps bodies lets the stage animate instead of collapsing.
useResizeObserver(briefBodyElement, () => {
  const height = briefBodyElement.value?.offsetHeight
  if (height) briefBodyHeight.value = height
})

function adjustVideoDuration(delta: -1 | 1) {
  const tier = selectedVideoRelayTier.value
  const next = configuredVideoDuration.value + delta
  configuredVideoDuration.value = tier ? snapSeedanceSeconds(tier, next, delta) : next
}

function commitVideoDurationInput(event: Event) {
  const input = event.target as HTMLInputElement
  const typed = Math.round(Number(input.value))
  if (input.value.trim() && Number.isFinite(typed)) {
    const tier = selectedVideoRelayTier.value
    configuredVideoDuration.value = tier ? snapSeedanceSeconds(tier, typed) : typed
  }
  // The bound value may be unchanged after clamping, so reset the field explicitly.
  input.value = String(configuredVideoDuration.value)
  fitVideoDurationInput(event)
}

function fitVideoDurationInput(event: Event) {
  const input = event.target as HTMLInputElement
  input.style.width = `${Math.max(1, input.value.length)}ch`
}

function previousTemplate() {
  activeTemplateIndex.value = (activeTemplateIndex.value - 1 + activeTemplates.value.length) % activeTemplates.value.length
  startTemplateAutoplay()
}

function nextTemplate() {
  activeTemplateIndex.value = (activeTemplateIndex.value + 1) % activeTemplates.value.length
  startTemplateAutoplay()
}

function selectTemplate(index: number) {
  activeTemplateIndex.value = index
  startTemplateAutoplay()
}

function advanceTemplate() {
  activeTemplateIndex.value = (activeTemplateIndex.value + 1) % activeTemplates.value.length
}

function stopTemplateAutoplay() {
  if (templateAutoplayTimer === undefined) return
  window.clearInterval(templateAutoplayTimer)
  templateAutoplayTimer = undefined
}

function startTemplateAutoplay() {
  stopTemplateAutoplay()
  if (!studioActive || activeTemplates.value.length <= 1) return
  templateAutoplayTimer = window.setInterval(advanceTemplate, 3000)
}

function previousPromptPage() {
  promptTemplatePage.value = (promptTemplatePage.value - 1 + promptTemplatePageCount.value) % promptTemplatePageCount.value
}

function nextPromptPage() {
  promptTemplatePage.value = (promptTemplatePage.value + 1) % promptTemplatePageCount.value
}

function openFilePicker() {
  if (processingReferenceImages.value) return
  fileInput.value?.click()
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  void addReferenceFiles(Array.from(input.files || []))
  input.value = ''
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  void addReferenceFiles(Array.from(event.dataTransfer?.files || []))
}

function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'))
  if (files.length) void addReferenceFiles(files)
}

// Generation endpoints take PNG/JPEG/WebP references; an animated GIF is flattened to its first frame.
async function gifFirstFrameAsPng(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('无法读取 GIF')
    context.drawImage(bitmap, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('无法读取 GIF')
    return new File([blob], file.name.replace(/\.gif$/i, '') + '.png', { type: 'image/png' })
  } finally {
    bitmap.close()
  }
}

async function addReferenceFiles(files: File[]) {
  if (processingReferenceImages.value) return
  const targetReferences = activeReferenceImages.value
  const targetMaximum = maxReferenceImages.value
  const remaining = targetMaximum - targetReferences.length
  if (remaining <= 0) {
    appStore.showError(`最多添加 ${targetMaximum} 张参考图`)
    return
  }
  const validFiles: File[] = []
  for (let file of files) {
    if (file.type === 'image/gif') {
      try { file = await gifFirstFrameAsPng(file) } catch {
        appStore.showError(`${file.name} 无法读取`)
        continue
      }
    }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      appStore.showError(`${file.name} 不是支持的图片格式`)
      continue
    }
    const sourceLimit = studioMode.value === 'video' ? MAX_VIDEO_REFERENCE_SOURCE_BYTES : MAX_REFERENCE_IMAGE_SIZE_BYTES
    const sourceLimitMB = studioMode.value === 'video' ? MAX_VIDEO_REFERENCE_SOURCE_MB : MAX_REFERENCE_IMAGE_SIZE_MB
    if (file.size > sourceLimit) {
      appStore.showError(`${file.name} 超过 ${sourceLimitMB}MB`)
      continue
    }
    validFiles.push(file)
  }

  if (studioMode.value !== 'video') {
    const accepted = validFiles
      .slice(0, remaining)
      .map(file => ({ file, url: URL.createObjectURL(file) }))
    targetReferences.push(...accepted)
    if (validFiles.length > remaining) appStore.showError(`已保留前 ${targetMaximum} 张有效参考图`)
    return
  }

  const uploadSequence = ++referenceUploadSequence
  processingReferenceImages.value = true
  let capacityExceeded = false
  try {
    for (let index = 0; index < validFiles.length; index++) {
      if (targetReferences.length >= targetMaximum) {
        capacityExceeded = true
        break
      }
      const sourceFile = validFiles[index]
      try {
        const optimized = await optimizeVideoReferenceImage(sourceFile)
        if (uploadSequence !== referenceUploadSequence) return
        const currentTotal = targetReferences.reduce((sum, reference) => sum + reference.file.size, 0)
        if (currentTotal + optimized.file.size > MAX_VIDEO_REFERENCE_TOTAL_BYTES) {
          appStore.showError(`参考图压缩后合计不能超过 ${MAX_VIDEO_REFERENCE_TOTAL_MB}MB，${sourceFile.name} 未添加`)
          continue
        }
        targetReferences.push({ file: optimized.file, url: URL.createObjectURL(optimized.file) })
      } catch (error) {
        if (uploadSequence !== referenceUploadSequence) return
        appStore.showError(errorMessage(error, `${sourceFile.name} 无法作为视频参考图`))
      }
    }
    if (capacityExceeded) appStore.showError(`已保留前 ${targetMaximum} 张有效参考图`)
  } finally {
    if (uploadSequence === referenceUploadSequence) processingReferenceImages.value = false
  }
}

function removeReference(index: number) {
  const [removed] = activeReferenceImages.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.url)
}

function clearReferenceImages() {
  referenceUploadSequence++
  processingReferenceImages.value = false
  const allReferences = [
    ...referenceImages.value,
    ...videoShots.value.flatMap(shot => shot.referenceImages),
  ]
  new Set(allReferences.map(reference => reference.url)).forEach(url => URL.revokeObjectURL(url))
  referenceImages.value = []
  videoShots.value.forEach(shot => { shot.referenceImages = [] })
}

function sizeForImage() {
  if (imageCapability.value === 'image2') {
    if (imageSizeMode.value === 'auto') return 'auto'
    if (imageSizeMode.value === 'custom') {
      const [width, height] = normalizeCustomImageSize(imageCustomWidth.value, imageCustomHeight.value)
      return `${width}x${height}`
    }
    return image2SizeFor(imageResolution.value, aspectRatio.value)
  }

  return image2SizeFor(imageResolution.value, aspectRatio.value)
}

function isImageRatioAvailable(resolution: string, ratio: string) {
  return (image2SizeOptions[resolution] || []).some(option => option.value === ratio)
}

watch(imageSizeDraftResolution, resolution => {
  if (!isImageRatioAvailable(resolution, imageSizeDraftRatio.value)) imageSizeDraftRatio.value = '1:1'
})

function image2SizeFor(resolution: string, ratio: string) {
  const options = image2SizeOptions[resolution] || image2SizeOptions['1K']
  return options.find(option => option.value === ratio)?.size || options[0].size
}

function normalizeCustomImageSize(widthValue: number, heightValue: number): [number, number] {
  const toMultipleOf16 = (value: number) => Math.max(16, Math.min(3840, Math.round(Number(value || 0) / 16) * 16))
  let width = toMultipleOf16(widthValue)
  let height = toMultipleOf16(heightValue)

  if (width / height > 3) height = toMultipleOf16(width / 3)
  if (height / width > 3) width = toMultipleOf16(height / 3)

  const minPixels = 655360
  const maxPixels = 8294400
  const pixels = width * height
  if (pixels < minPixels || pixels > maxPixels) {
    const targetPixels = pixels < minPixels ? minPixels : maxPixels
    const scale = Math.sqrt(targetPixels / pixels)
    width = toMultipleOf16(width * scale)
    height = toMultipleOf16(height * scale)
  }

  while (width * height > maxPixels) {
    if (width >= height) width -= 16
    else height -= 16
  }
  return [width, height]
}

function customImageResolution(width: number, height: number) {
  const edge = Math.max(width, height)
  return edge <= 1024 ? '1K' : edge <= 2048 ? '2K' : '4K'
}

function ratioForDimensions(width: number, height: number) {
  const greatestCommonDivisor = (left: number, right: number): number => right === 0
    ? left
    : greatestCommonDivisor(right, left % right)
  const divisor = greatestCommonDivisor(width, height)
  return `${width / divisor}:${height / divisor}`
}

function openImageSizeDialog() {
  imageSizeDraftMode.value = imageCapability.value === 'image2' ? imageSizeMode.value : 'ratio'
  imageSizeDraftResolution.value = imageResolution.value
  imageSizeDraftRatio.value = isImageRatioAvailable(imageResolution.value, aspectRatio.value)
    ? aspectRatio.value
    : '1:1'
  imageSizeDraftWidth.value = imageCustomWidth.value
  imageSizeDraftHeight.value = imageCustomHeight.value
  imageSizeDialogOpen.value = true
}

function confirmImageSize() {
  if (imageSizeDraftMode.value === 'auto') {
    imageResolution.value = '1K'
  } else if (imageSizeDraftMode.value === 'custom') {
    const [width, height] = normalizeCustomImageSize(imageSizeDraftWidth.value, imageSizeDraftHeight.value)
    const resolution = customImageResolution(width, height)
    if (resolution === '4K' && !imageResolutionOptions.value.includes('4K')) {
      appStore.showError('当前创作分组没有可用的 4K 图片模型，请缩小尺寸后重试')
      return
    }
    imageCustomWidth.value = width
    imageCustomHeight.value = height
    imageResolution.value = resolution
    aspectRatio.value = ratioForDimensions(width, height)
  } else if (imageSizeDraftMode.value === 'ratio') {
    imageResolution.value = imageSizeDraftResolution.value
    aspectRatio.value = imageSizeDraftRatio.value
  }
  imageSizeMode.value = imageSizeDraftMode.value
  imageSizeDialogOpen.value = false
}

function videoAspectLabel(ratio: string) {
  return videoAspectOptions.find(option => option.value === ratio)?.label || ratio
}

function openVideoParamsDialog() {
  videoAspectDraft.value = activeVideoAspectRatio.value
  videoFollowSourceDraft.value = activeVideoFollowSourceAspect.value
  videoResolutionDraft.value = activeVideoResolution.value
  videoParamsDialogOpen.value = true
}

function confirmVideoParams() {
  activeVideoAspectRatio.value = videoAspectDraft.value
  activeVideoFollowSourceAspect.value = videoFollowSourceDraft.value
  activeVideoResolution.value = videoResolutionDraft.value
  videoParamsDialogOpen.value = false
}

function ratioShapeStyle(ratio: string) {
  const [width, height] = ratio.split(':').map(Number)
  if (!width || !height) return undefined
  const maxWidth = 36
  const maxHeight = 30
  const scale = Math.min(maxWidth / width, maxHeight / height)
  return {
    width: `${Math.max(8, width * scale)}px`,
    height: `${Math.max(8, height * scale)}px`,
  }
}

async function startGeneration() {
  await generateFromCurrentSettings('初版作品')
}

function captureSettingsScroll() {
  const panel = settingsScrollElement.value
  if (!panel) return () => {}
  const top = panel.scrollTop
  // The task bar and draft change the layout; keep the settings at the
  // position the user chose instead of following browser scroll anchoring.
  return () => { void nextTick(() => { panel.scrollTop = top }) }
}

// On mobile the canvas is stacked above the settings, so the generate button
// sits below the progress view; bring the new task into view. Regenerating
// from a result returns the whole page to the top instead.
function revealCanvasOnMobile(pageTop = false) {
  if (!window.matchMedia?.('(max-width: 800px)').matches) return
  void nextTick(() => {
    if (pageTop) window.scrollTo?.({ top: 0, behavior: 'smooth' })
    else canvasPanelElement.value?.scrollIntoView?.({ block: 'start', behavior: 'smooth' })
  })
}

async function generateFromCurrentSettings(source: string, revealPageTop = false) {
  if (!canGenerate.value || !selectedApiKey.value || !selectedGroup.value) return
  const taskMode = studioMode.value
  const taskGroup = selectedGroup.value
  const taskApiKey = selectedApiKey.value.key
  const taskModel = taskMode === 'image' ? imageModelForGeneration() : selectedModel.value
  if (!taskModel) {
    appStore.showError('当前输出尺寸没有可用的兼容图片模型，请切换创作分组或输出尺寸')
    return
  }
  const taskProfessionalVideo = taskMode === 'video' && professionalVideo.value
  const taskPrompt = taskProfessionalVideo
    ? videoShots.value.map((shot, index) => `镜头 ${index + 1}：${videoShotPrompt(shot.prompt)}`).join('\n')
    : effectivePrompt.value
  const videoShotSnapshots = taskMode === 'video'
    ? taskProfessionalVideo
      ? videoShots.value.map(shot => ({
          prompt: videoShotPrompt(shot.prompt),
          duration: Number(shot.duration),
          resolution: shot.resolution,
          aspectRatio: shot.aspectRatio,
          followSourceAspect: shot.followSourceAspect,
          generationMethod: shot.generationMethod,
          referenceFiles: shot.referenceImages.map(reference => reference.file),
        }))
      : [{
          prompt: taskPrompt,
          duration: videoDuration.value,
          resolution: videoResolution.value,
          aspectRatio: aspectRatio.value,
          followSourceAspect: videoFollowSourceAspect.value,
          generationMethod: videoGenerationMethod.value,
          referenceFiles: referenceImages.value.map(reference => reference.file),
        }]
    : []
  const taskAspectRatio = taskMode === 'video' ? videoShotSnapshots[0]?.aspectRatio || '16:9' : aspectRatio.value
  const taskReferenceCount = taskMode === 'video'
    ? videoShotSnapshots.reduce((sum, shot) => sum + shot.referenceFiles.length, 0)
    : referenceImages.value.length
  const imageSnapshot: ImageGenerationSnapshot | null = taskMode === 'image'
    ? {
        apiKey: taskApiKey,
        platform: taskGroup.platform,
        capability: imageCapability.value,
        model: taskModel,
        prompt: taskPrompt,
        outputCount: Math.min(outputCount.value, maxOutputCount.value),
        size: sizeForImage(),
        quality: imageQuality.value,
        outputFormat: outputFormat.value,
        ...(outputFormat.value === 'gif' ? {
          frameCount: clampGifSetting(gifFrameCount.value, GIF_FRAME_COUNT_RANGE),
          frameDurationMs: clampGifSetting(gifFrameDurationMs.value, GIF_FRAME_DURATION_RANGE),
        } : {}),
        background: 'auto',
        referenceFiles: referenceImages.value.map(reference => reference.file),
        aspectRatio: taskAspectRatio,
        resolution: imageResolution.value,
        sizeMode: imageCapability.value === 'image2' ? imageSizeMode.value : 'ratio',
      }
    : null
  const videoSnapshot: VideoGenerationSnapshot | null = taskMode === 'video'
    ? {
        apiKey: taskApiKey,
        model: taskModel,
        shots: videoShotSnapshots,
      }
    : null
  const now = Date.now()
  const work: CreatorHistoryItem = {
    id: crypto.randomUUID(),
    type: taskMode,
    status: 'pending',
    prompt: taskPrompt,
    model: taskModel,
    provider: taskMode === 'image'
      ? imageCapabilities.find(item => item.id === imageCapability.value)?.label || imageCapability.value
      : `${videoProviderLabel(taskModel)} 视频`,
    groupName: taskGroup.name,
    groupId: taskGroup.id,
    apiKeyId: selectedApiKey.value.id,
    createdAt: now,
    updatedAt: now,
    outputs: [],
    imageCapability: taskMode === 'image' ? imageSnapshot?.capability : undefined,
    aspectRatio: taskAspectRatio,
    resolution: taskMode === 'image' ? imageSnapshot?.resolution : videoSnapshot?.shots[0]?.resolution,
    outputSize: taskMode === 'image' ? imageSnapshot?.size : undefined,
    imageSizeMode: taskMode === 'image' ? imageSnapshot?.sizeMode : undefined,
    quality: taskMode === 'image' ? imageSnapshot?.quality : undefined,
    outputFormat: taskMode === 'image' ? imageSnapshot?.outputFormat : undefined,
    frameCount: taskMode === 'image' ? imageSnapshot?.frameCount : undefined,
    frameDurationMs: taskMode === 'image' ? imageSnapshot?.frameDurationMs : undefined,
    background: taskMode === 'image' ? imageSnapshot?.background : undefined,
    referenceCount: taskReferenceCount,
    videoGenerationMethod: taskMode === 'video' ? videoSnapshot?.shots[0]?.generationMethod : undefined,
    outputCount: taskMode === 'image' ? imageSnapshot?.outputCount : videoSnapshot?.shots.length,
    requestedDuration: taskMode === 'video' ? videoSnapshot?.shots.reduce((sum, shot) => sum + shot.duration, 0) : undefined,
    shotCount: taskMode === 'video' ? videoSnapshot?.shots.length : undefined,
    shotPrompts: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.prompt) : undefined,
    shotDurations: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.duration) : undefined,
    shotAspectRatios: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.aspectRatio) : undefined,
    shotResolutions: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.resolution) : undefined,
    shotGenerationMethods: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.generationMethod) : undefined,
    shotReferenceCounts: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.referenceFiles.length) : undefined,
    shotFollowSourceAspects: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.followSourceAspect) : undefined,
    // Saved with the work so a refreshed page can submit the remaining shots.
    shotQueue: videoSnapshot && videoSnapshot.shots.length > 1
      ? { nextIndex: 0, failedIndexes: [], referenceBlobs: videoSnapshot.shots.map(shot => [...shot.referenceFiles]) }
      : undefined,
    version: 'v1',
    source,
  }
  const task = reactive<GenerationTask>({
    id: work.id,
    mode: taskMode,
    prompt: taskPrompt,
    phase: 'submitting',
    hasExactProgress: false,
    percent: 0,
    progress: taskMode === 'image' ? '正在提交画面描述，请稍候' : '正在提交视频任务，请稍候',
    startedAt: now,
  })
  const restoreSettingsScroll = captureSettingsScroll()
  activeGenerations.set(work.id, task)
  generationClock.value = now
  if (generationTimer === undefined) {
    generationTimer = window.setInterval(() => { generationClock.value = Date.now() }, 1000)
  }
  historyItems.value = [work, ...historyItems.value]
  selectedWork.value = work
  historyFilter.value = taskMode
  restoreSettingsScroll()
  revealCanvasOnMobile(revealPageTop)
  let releaseShotLock: (() => void) | null = null
  try {
    if (work.shotQueue) releaseShotLock = await acquireVideoShotLock(work.id)
    await persistWork(work)
    if (taskMode === 'image' && imageSnapshot) await generateImageWork(work, imageSnapshot, task)
    else if (videoSnapshot) await generateVideoWork(work, videoSnapshot, task)
    work.status = 'completed'
    work.completedAt = Date.now()
    work.updatedAt = work.completedAt
    work.generationDurationMs = work.completedAt - task.startedAt
    task.percent = 100
    task.progress = '作品已完成'
    await persistWork(work)
    if (historyItems.value.some(item => item.id === work.id)) applyHistoryUpdate(cloneWork(work))
    if (missingOutputCount(work)) appStore.showWarning(work.error || `已生成 ${work.outputs.length} ${work.type === 'image' ? '张，部分图片' : '段，部分镜头'}生成失败`)
    else appStore.showSuccess('作品生成完成')
  } catch (error) {
    if (error instanceof VideoContentDownloadError && work.requestId && !work.outputs.length) {
      // The task finished upstream; the existing reload view fetches it again.
      work.status = 'completed'
      work.completedAt = Date.now()
      work.updatedAt = work.completedAt
      work.generationDurationMs = work.completedAt - task.startedAt
      applyHistoryUpdate(cloneWork(work))
      await persistWork(work)
      videoHistoryFeedback.value = { workId: work.id, tone: 'error', message: error.message }
      appStore.showWarning(error.message)
      return
    }
    if (work.imageTaskIds?.length) {
      // Server-side image tasks outlive the page and failed status checks; keep
      // the work pending so "刷新生成结果" can load them later.
      work.updatedAt = Date.now()
      await persistWork(work)
      applyHistoryUpdate(cloneWork(work))
      if (!disposed) appStore.showWarning('图片仍在服务器生成，可稍后点击“刷新生成结果”同步')
      return
    }
    if (disposed && work.shotQueue) {
      // The remaining shots continue when the studio is opened again.
      work.updatedAt = Date.now()
      await persistWork(work)
      return
    }
    work.status = 'failed'
    work.updatedAt = Date.now()
    work.error = creatorGenerationErrorMessage(error, taskMode, imageSnapshot?.capability, videoSnapshot?.model)
    applyHistoryUpdate(cloneWork(work))
    await persistWork(work)
    appStore.showError(work.error)
  } finally {
    releaseShotLock?.()
    activeGenerations.delete(work.id)
    if (!activeGenerations.size && generationTimer !== undefined) {
      window.clearInterval(generationTimer)
      generationTimer = undefined
    }
  }
}

function loadCreatorImageBlob(apiKey: string, url: string): Promise<Blob> {
  const pending = imageDownloads.get(url)
  if (pending) return pending
  const download = downloadCreatorImage(apiKey, url).finally(() => {
    if (imageDownloads.get(url) === download) imageDownloads.delete(url)
  })
  imageDownloads.set(url, download)
  return download
}

async function localImageOutput(apiKey: string, output: string): Promise<string> {
  if (!/^https?:\/\//i.test(output)) return output
  const blob = await loadCreatorImageBlob(apiKey, output)
  return fileToDataUrl(blob)
}

async function retryLocalImageSave() {
  const work = selectedWork.value
  if (!work || work.type !== 'image') return
  historicalImageSaves.delete(work.id)
  localSaveWarning.value = ''
  await preserveHistoricalImage(work)
  // Also retry IndexedDB if the image is already self-contained in memory.
  await persistWork(work)
}

async function preserveHistoricalImages() {
  if (historicalImageRecoveryRunning) return
  historicalImageRecoveryRunning = true
  try {
    // Recover still-valid links while the page is open, before they expire.
    for (const work of [...historyItems.value]) {
      if (disposed) break
      await preserveHistoricalImage(work)
    }
  } finally { historicalImageRecoveryRunning = false }
}

function preserveHistoricalImage(work: CreatorHistoryItem): Promise<void> {
  if (work.type !== 'image' || work.status === 'pending' || !work.outputs.some(output => /^https?:\/\//i.test(output))) return Promise.resolve()
  const existing = historicalImageSaves.get(work.id)
  if (existing) return existing
  const revision = work.updatedAt
  const outputs = [...work.outputs]
  const saving = (async () => {
    try {
      const key = findKeyForWork(work)
      const localOutputs: string[] = []
      for (const output of outputs) localOutputs.push(await localImageOutput(key?.key || '', output))
      // Do not resurrect an evicted/deleted work or overwrite another tab's edit.
      const latest = await creatorHistory.get(work.id)
      if (disposed || !latest || latest.updatedAt !== revision || !historyItems.value.some(item => item.id === work.id)) return
      const recovered = { ...cloneWork(work), outputs: localOutputs, updatedAt: Math.max(Date.now(), revision + 1) }
      delete recovered.imagePersistenceError
      const saved = await persistWork(recovered, revision)
      if (saved !== undefined) applyHistoryUpdate(recovered)
    } catch {
      work.imagePersistenceError = '原图暂时无法保存。上游临时链接可能已失效；已失效且未保存的图片无法从历史记录恢复。'
      if (selectedWork.value?.id === work.id) localSaveWarning.value = work.imagePersistenceError
    }
  })()
  historicalImageSaves.set(work.id, saving)
  return saving
}

async function generateImageWork(work: CreatorHistoryItem, input: ImageGenerationSnapshot, task: GenerationTask) {
  task.phase = 'generating'
  task.hasExactProgress = false
  const requestCount = Math.max(1, input.outputCount || 1)
  // A resumed work already holds the images synced from its earlier tasks.
  const initialOutputCount = Math.min(work.outputs.length, requestCount)
  const isGeminiProtocol = input.platform === 'gemini' || input.platform === 'antigravity'
  // Gemini generateContent returns one image per call and some upstreams
  // ignore n, so keep requesting until the batch is full (one call per image
  // at most). Image2 always asks for a single image per request.
  const requestAttempts = requestCount - initialOutputCount
  const requestsSingleImage = input.capability === 'image2' || isGeminiProtocol
  const usesOpenAIImageSize = input.capability === 'image2'
  const usesGptImageModel = /^gpt-image-/i.test(input.model.trim())
  // GPT Image models return b64_json by default and reject response_format.
  // Grok still needs the explicit response format so its temporary URLs are
  // converted into self-contained data URLs by the gateway.
  const usesBase64Response = !isGeminiProtocol && !usesGptImageModel && input.capability === 'grok'
  const outputs: string[] = work.outputs.slice(0, initialOutputCount)
  const imageRequest = () => ({
    model: input.model,
    prompt: input.prompt,
    n: requestsSingleImage ? 1 : requestCount - outputs.length,
    size: input.size,
    quality: input.quality,
    outputFormat: input.outputFormat,
    frameCount: input.frameCount,
    frameDurationMs: input.frameDurationMs,
    background: 'auto',
    // Grok may return temporary cross-origin URLs that browsers cannot save
    // through the download attribute. Base64 keeps the result self-contained.
    ...(usesBase64Response ? { responseFormat: 'b64_json' } : {}),
    referenceImages: input.referenceFiles,
    protocol: (isGeminiProtocol ? 'gemini' : 'openai') as 'gemini' | 'openai',
    ...(!usesOpenAIImageSize ? {
      aspectRatio: input.aspectRatio,
      imageSize: input.resolution,
    } : {}),
  })
  // A server-side task keeps the result through a refresh; gateways without
  // async image tasks fall back to one synchronous request.
  const generate = async (): Promise<{ result: ImageGenerationResult; taskId?: string }> => {
    const request = imageRequest()
    const taskId = asyncImageUnavailableKeys.has(input.apiKey) ? null : await submitCreatorImageTask(input.apiKey, request)
    if (!taskId) {
      asyncImageUnavailableKeys.add(input.apiKey)
      return { result: await generateCreatorImage(input.apiKey, request) }
    }
    work.imageTaskIds = [...(work.imageTaskIds || []), taskId]
    work.updatedAt = Date.now()
    await persistWork(work)
    try {
      return { result: await waitForImageTask(input.apiKey, taskId, input.outputFormat), taskId }
    } catch (error) {
      if (error instanceof ImageTaskFailedError) {
        work.imageTaskIds = work.imageTaskIds?.filter(id => id !== taskId)
        await persistWork(work)
        throw error.cause
      }
      // The task may still finish; never resubmit it.
      throw new ImageTaskPendingError(error)
    }
  }
  const generateWithRetry = async (index: number) => {
    try {
      return await generate()
    } catch (error) {
      if (error instanceof ImageTaskPendingError || input.capability !== 'grok' || !isRetryableGrokTransientError(error)) throw error
      task.progress = 'Grok 上游暂时不可用，2 秒后自动重试（1/1）'
      await delay(2000)
      task.progress = requestCount > 1
        ? `正在重试第 ${initialOutputCount + index + 1} / ${requestCount} 张图片`
        : '正在重新调用 Grok 图片模型'
      return await generate()
    }
  }
  // One failed image must not discard the images that already succeeded.
  let lastError: unknown
  task.failedCount = 0
  if (requestsSingleImage && requestAttempts > 1) {
    // Single-image requests run all at once; each image is saved as soon as
    // it finishes, so a slow or failed one never holds back the others.
    let finished = 0
    const updateProgress = () => {
      const failedNote = task.failedCount ? `，${task.failedCount} 张失败` : ''
      task.progress = `正在同时生成 ${requestAttempts} 张图片（已完成 ${finished} 张${failedNote}）`
    }
    updateProgress()
    let pendingError: ImageTaskPendingError | undefined
    let saveError: unknown
    await Promise.all(Array.from({ length: requestAttempts }, async (_, index) => {
      let generated
      try {
        generated = await generateWithRetry(index)
      } catch (error) {
        if (error instanceof ImageTaskPendingError) pendingError ??= error
        else lastError = error
        task.failedCount = (task.failedCount || 0) + 1
        updateProgress()
        return
      }
      try {
        await saveImageBatch(work, generated.result, generated.taskId, input)
        finished++
      } catch (error) {
        saveError ??= error
      }
      updateProgress()
    }))
    outputs.splice(0, outputs.length, ...work.outputs)
    // Unfinished server tasks stay in imageTaskIds for a later refresh.
    if (pendingError) throw pendingError
    if (saveError) throw saveError
  }
  else for (let index = 0; index < requestAttempts && outputs.length < requestCount; index++) {
    const failedNote = task.failedCount ? `（${task.failedCount} 张失败）` : ''
    task.progress = requestCount > 1
      ? `正在生成第 ${initialOutputCount + index + 1} / ${requestCount} 张图片${failedNote}`
      : '正在调用图片模型，请稍候'
    let generated
    try {
      generated = await generateWithRetry(index)
    } catch (error) {
      if (error instanceof ImageTaskPendingError) throw error
      lastError = error
      task.failedCount = requestsSingleImage ? task.failedCount + 1 : requestCount - outputs.length
      // A batch request already asked for every remaining image.
      if (!requestsSingleImage) break
      continue
    }
    task.progress = '图片已生成，正在保存原图到当前浏览器'
    await saveImageBatch(work, generated.result, generated.taskId, input)
    outputs.splice(0, outputs.length, ...work.outputs)
  }
  work.outputs = outputs
  if (!work.outputs.length) throw lastError ?? new Error('模型没有返回可用图片')
  if (lastError && outputs.length < requestCount) {
    const reason = creatorGenerationErrorMessage(lastError, 'image', input.capability)
    work.error = `已生成 ${outputs.length} / ${requestCount} 张，其余 ${requestCount - outputs.length} 张生成失败：${reason}`
  }
}

type ImageBatchSettings = Pick<ImageGenerationSnapshot, 'apiKey' | 'capability' | 'outputCount' | 'sizeMode' | 'aspectRatio' | 'size'> & { outputFormat?: string }

// GIF / SVG cannot be converted in the browser. When the upstream ignores the requested
// format (e.g. returns a PNG for SVG), tell the user the channel is at fault.
const SPECIAL_IMAGE_FORMAT_MIME: Record<string, { mime: string; label: string }> = {
  gif: { mime: 'image/gif', label: 'GIF' },
  svg: { mime: 'image/svg+xml', label: 'SVG' },
}
function warnIgnoredSpecialFormat(outputs: string[], format: string | undefined) {
  const expected = SPECIAL_IMAGE_FORMAT_MIME[(format || '').toLowerCase()]
  if (!expected) return
  const actual = outputs
    .map(output => /^data:(image\/[a-z0-9.+-]+)[;,]/i.exec(output)?.[1]?.toLowerCase())
    .find(mime => mime && mime !== expected.mime)
  if (!actual) return
  appStore.showWarning(`当前上游渠道没有按 ${expected.label} 输出，实际返回了 ${outputFormatLabel(`data:${actual};`) || actual}。请切换支持 GPT Image 2.6 ${expected.label} 输出的创作分组或渠道。`, 8000)
}

// Saves one finished request into the work, and forgets its server task in the
// same write so a refresh never loads the same image twice.
async function saveImageBatch(work: CreatorHistoryItem, result: ImageGenerationResult, taskId: string | undefined, input: ImageBatchSettings) {
  const requestCount = Math.max(1, input.outputCount || 1)
  const batchOutputs: string[] = []
  for (const item of result.data) {
    if (!item.url) continue
    try {
      batchOutputs.push(await localImageOutput(input.apiKey, item.url))
    } catch {
      batchOutputs.push(item.url)
      work.imagePersistenceError = '原图尚未保存到本地，上游链接可能失效。请重试保存或立即下载原图。'
      localSaveWarning.value = work.imagePersistenceError
    }
  }
  warnIgnoredSpecialFormat(batchOutputs, input.outputFormat)
  // Save the provider bytes unchanged. Requested dimensions are generation
  // parameters; they must never resize, crop or re-encode the finished image.
  const sourceSizes = await Promise.all(batchOutputs.map(readCreatorImageSize))
  // Concurrent requests save into the same work, so read its outputs only
  // after every await and append synchronously to keep the other images.
  const remaining = Math.max(0, requestCount - work.outputs.length)
  const previousSizes = work.outputs.map((_, index) => work.imageOutputSizes?.[index] || '')
  const previousUpstreamSizes = work.outputs.map((_, index) => work.upstreamImageSizes?.[index] || '')
  work.imageOutputSizes = [...previousSizes, ...sourceSizes.slice(0, remaining)]
  work.upstreamImageSizes = [...previousUpstreamSizes, ...sourceSizes.slice(0, remaining)]
  work.actualOutputSize = work.imageOutputSizes[0] || undefined
  work.outputs = [...work.outputs, ...batchOutputs.slice(0, remaining)]
  if (taskId) work.imageTaskIds = work.imageTaskIds?.filter(id => id !== taskId)
  work.updatedAt = Date.now()
  await persistWork(work)
}

// Keys whose gateway answered without async image tasks (no object storage).
const asyncImageUnavailableKeys = new Set<string>()
const IMAGE_TASK_POLL_INTERVAL_MS = 3000
// Matches the gateway's 30 minute task execution limit.
const IMAGE_TASK_MAX_POLLS = 620

class ImageTaskFailedError extends Error {
  constructor(readonly cause: unknown) {
    super(errorMessage(cause, '图片生成失败'))
  }
}

class ImageTaskPendingError extends Error {
  constructor(readonly cause: unknown) {
    super(errorMessage(cause, '图片任务状态暂时无法查询'))
  }
}

async function waitForImageTask(apiKey: string, taskId: string, outputFormat: string) {
  let consecutiveFailures = 0
  for (let attempt = 0; attempt < IMAGE_TASK_MAX_POLLS; attempt++) {
    if (disposed) throw new Error('页面已关闭，任务可稍后从历史记录继续查看')
    if (attempt > 0) await delay(IMAGE_TASK_POLL_INTERVAL_MS)
    let status: Awaited<ReturnType<typeof getCreatorImageTask>>
    try {
      status = await getCreatorImageTask(apiKey, taskId, { outputFormat })
      consecutiveFailures = 0
    } catch (error) {
      if (isMissingVideoRequest(error)) throw new ImageTaskFailedError(new Error('图片任务已过期或不存在，请带回参数重新生成。'))
      if (++consecutiveFailures >= VIDEO_STATUS_MAX_CONSECUTIVE_FAILURES) throw error
      continue
    }
    if (status.status === 'completed' && status.result) return status.result
    if (status.status === 'failed') throw new ImageTaskFailedError(status.error)
  }
  throw new Error('图片生成等待超时，请稍后点击“刷新生成结果”')
}

// Picks up the server tasks of an image work whose page was refreshed or closed.
async function resumeImageWork(work: CreatorHistoryItem) {
  const taskIds = [...(work.imageTaskIds || [])]
  if (!taskIds.length || activeGenerations.has(work.id)) return
  const key = findKeyForWork(work)
  if (!key) {
    appStore.showError('未找到该作品分组对应的可用 Key，暂时无法同步图片结果。')
    return
  }
  const requestCount = Math.max(1, work.outputCount || 1)
  const settings: ImageBatchSettings = {
    apiKey: key.key,
    capability: work.imageCapability || 'image2',
    outputCount: requestCount,
    sizeMode: work.imageSizeMode || 'auto',
    aspectRatio: work.aspectRatio || '',
    size: work.outputSize || '',
    outputFormat: work.outputFormat || 'png',
  }
  const task = reactive<GenerationTask>({
    id: work.id,
    mode: 'image',
    prompt: work.prompt,
    phase: 'generating',
    hasExactProgress: false,
    percent: 0,
    progress: '正在同步图片生成结果',
    startedAt: work.createdAt,
  })
  activeGenerations.set(work.id, task)
  generationClock.value = Date.now()
  if (generationTimer === undefined) {
    generationTimer = window.setInterval(() => { generationClock.value = Date.now() }, 1000)
  }
  let lastError: unknown
  let interrupted = false
  let taskFailed = false
  try {
    for (const taskId of taskIds) {
      try {
        const result = await waitForImageTask(key.key, taskId, work.outputFormat || 'png')
        task.progress = '图片已生成，正在保存原图到当前浏览器'
        await saveImageBatch(work, result, taskId, settings)
      } catch (error) {
        if (disposed) return
        if (!(error instanceof ImageTaskFailedError)) {
          interrupted = true
          lastError = error
          continue
        }
        lastError = error.cause
        taskFailed = true
        work.imageTaskIds = work.imageTaskIds?.filter(id => id !== taskId)
        await persistWork(work)
      }
    }
    // Image2 and Grok submit one task per image, so a refresh loses the
    // images that were not submitted yet. Submit them now from the saved
    // settings; reference uploads are not kept, so those works stop here.
    // A failed task is final: resubmitting it would charge again unasked.
    let continued = false
    if (!interrupted && !taskFailed && work.outputs.length < requestCount && !work.referenceCount && work.model) {
      continued = true
      const platform = groups.value.find(group => group.id === key.group_id)?.platform || key.group?.platform || ''
      try {
        await generateImageWork(work, {
          ...settings,
          platform,
          model: work.model,
          prompt: work.prompt,
          quality: work.quality || 'auto',
          outputFormat: work.outputFormat || 'png',
          frameCount: work.frameCount,
          frameDurationMs: work.frameDurationMs,
          background: work.background || 'auto',
          referenceFiles: [],
          resolution: work.resolution || '',
        }, task)
      } catch (error) {
        if (disposed) return
        if (error instanceof ImageTaskPendingError) {
          interrupted = true
          lastError = error.cause
        } else {
          lastError = error
        }
      }
    }
    if (interrupted) {
      // Unfinished tasks stay saved; the next refresh continues from here.
      applyHistoryUpdate(cloneWork(work))
      appStore.showError(creatorGenerationErrorMessage(lastError, 'image', settings.capability))
      return
    }
    if (work.outputs.length) {
      work.status = 'completed'
      if (work.outputs.length < requestCount && taskFailed) {
        work.error = `已同步 ${work.outputs.length} / ${requestCount} 张；其余图片生成失败或任务已中断，请带回参数重新生成。`
      } else if (work.outputs.length < requestCount && !continued) {
        work.error = `已同步 ${work.outputs.length} / ${requestCount} 张；其余图片在页面刷新前未提交，且参考图未保存，请带回参数继续生成。`
      }
    } else {
      work.status = 'failed'
      work.error = creatorGenerationErrorMessage(lastError ?? new Error('图片生成失败'), 'image', settings.capability)
    }
    work.completedAt = Date.now()
    work.updatedAt = work.completedAt
    work.generationDurationMs = Math.max(0, work.completedAt - work.createdAt)
    await persistWork(work)
    applyHistoryUpdate(cloneWork(work))
    if (work.status === 'completed') appStore.showSuccess('图片已同步到本地')
    else appStore.showError(work.error || '图片生成失败')
  } finally {
    activeGenerations.delete(work.id)
    if (!activeGenerations.size && generationTimer !== undefined) {
      window.clearInterval(generationTimer)
      generationTimer = undefined
    }
  }
}

async function refreshImageWork(work: CreatorHistoryItem) {
  if (work.imageTaskIds?.length) await resumeImageWork(work)
  else await syncHistory()
}

function isSingleOutputImageModel(model: string, _resolution: string, capability: ImageCapability) {
  return capability === 'image2' && isImage2FourKModel(model)
}

// Preserve original pixels separately from the requested billing tier.
async function readCreatorImageSize(output: string): Promise<string> {
  const png = imageDataUrlDimensions(output)
  if (png) return `${png.width}x${png.height}`
  if (!creatorImageHasDecodableHeader(output)) return ''
  return new Promise(resolve => {
    const image = new Image()
    const timeout = window.setTimeout(() => resolve(''), 5000)
    image.onload = () => {
      window.clearTimeout(timeout)
      resolve(image.naturalWidth && image.naturalHeight ? `${image.naturalWidth}x${image.naturalHeight}` : '')
    }
    image.onerror = () => { window.clearTimeout(timeout); resolve('') }
    image.src = output
  })
}

function creatorImageHasDecodableHeader(output: string) {
  const match = /^data:image\/(?:png|jpeg|webp);base64,/i.exec(output.slice(0, 40))
  if (!match) return false
  try {
    const header = window.atob(output.slice(match[0].length, match[0].length + 32))
    return header.startsWith('\x89PNG\r\n\x1a\n') || header.startsWith('\xff\xd8\xff') || (header.startsWith('RIFF') && header.slice(8, 12) === 'WEBP')
  } catch { return false }
}

async function normalizeCreatorImageOutput(output: string, requestedRatio: string, requestedSize: string) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(requestedRatio || '')
  const sizeMatch = /^(\d+)x(\d+)$/.exec(requestedSize || '')
  if (!match || !sizeMatch || !output) return output
  const targetRatio = Number(match[1]) / Number(match[2])
  const targetWidth = Number(sizeMatch[1])
  const targetHeight = Number(sizeMatch[2])
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || !targetWidth || !targetHeight || typeof window === 'undefined') return output
  const mimeType = /^data:(image\/(?:png|jpeg|webp));base64,/i.exec(output.trim())?.[1]
  if (!mimeType) return output
  const sourceSize = imageDataUrlDimensions(output)
  if (sourceSize && sourceSize.width === targetWidth && sourceSize.height === targetHeight) return output
  if (!sourceSize && !creatorImageHasDecodableHeader(output)) return output

  return new Promise<string>(resolve => {
    const timeout = window.setTimeout(() => resolve(output), 5000)
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      window.clearTimeout(timeout)
      const sourceWidth = image.naturalWidth || image.width || sourceSize?.width || 0
      const sourceHeight = image.naturalHeight || image.height || sourceSize?.height || 0
      if (!sourceWidth || !sourceHeight) {
        resolve(output)
        return
      }
      const sourceRatio = sourceWidth / sourceHeight
      const cropWidth = sourceRatio > targetRatio ? Math.round(sourceHeight * targetRatio) : sourceWidth
      const cropHeight = sourceRatio > targetRatio ? sourceHeight : Math.round(sourceWidth / targetRatio)
      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const context = canvas.getContext('2d')
      if (!context) {
        resolve(output)
        return
      }
      const offsetX = Math.round((sourceWidth - cropWidth) / 2)
      const offsetY = Math.round((sourceHeight - cropHeight) / 2)
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, offsetX, offsetY, cropWidth, cropHeight, 0, 0, targetWidth, targetHeight)
      try {
        resolve(canvas.toDataURL(mimeType))
      } catch {
        resolve(output)
      }
    }
    image.onerror = () => {
      window.clearTimeout(timeout)
      resolve(output)
    }
    image.src = output
  })
}

// Image-to-video keeps the source shape, so a custom ratio is applied by
// center-cropping the source at its own resolution before submission.
async function cropSourceImageToRatio(source: string, ratio: string) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio || '')
  const size = /^(\d+)x(\d+)$/.exec(await readCreatorImageSize(source))
  if (!match || !size) return source
  const targetRatio = Number(match[1]) / Number(match[2])
  const width = Number(size[1])
  const height = Number(size[2])
  const cropWidth = width / height > targetRatio ? Math.round(height * targetRatio) : width
  const cropHeight = width / height > targetRatio ? height : Math.round(width / targetRatio)
  return normalizeCreatorImageOutput(source, ratio, `${cropWidth}x${cropHeight}`)
}

async function readHistoricalImageSizes(work: CreatorHistoryItem) {
  if (work.type !== 'image' || !work.outputs.length) return
  if (work.imageOutputSizes?.length === work.outputs.length && work.imageOutputSizes.every(Boolean)) return
  const sizes = await Promise.all(work.outputs.map(readCreatorImageSize))
  if (!sizes.some(Boolean)) return
  // Older versions may have overwritten originals with resized files. Record
  // the saved file dimensions without changing its bytes or upstream metadata.
  work.imageOutputSizes = sizes.map((size, index) => size || work.imageOutputSizes?.[index] || '')
  work.actualOutputSize = work.imageOutputSizes[0] || undefined
  work.updatedAt = Date.now()
  await persistWork(work)
  historyItems.value = historyItems.value.map(item => item.id === work.id ? cloneWork(work) : item)
  if (selectedWork.value?.id === work.id) selectedWork.value = cloneWork(work)
}

function imageDataUrlDimensions(output: string) {
  // PNG / GIF dimensions live in the first 24 bytes. Never decode the entire 4K
  // payload just to read its header on a history selection.
  const match = /^data:image\/(png|gif);base64,/i.exec(output.slice(0, 32))
  if (!match) return null
  try {
    const decoded = window.atob(output.slice(match[0].length, match[0].length + 128).replace(/\s/g, '').slice(0, 32))
    const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0))
    const view = new DataView(bytes.buffer)
    let width = 0
    let height = 0
    if (match[1].toLowerCase() === 'png') {
      if (decoded.length < 24 || decoded.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || decoded.slice(12, 16) !== 'IHDR') return null
      width = view.getUint32(16)
      height = view.getUint32(20)
    } else {
      // GIF logical screen size: little-endian uint16 pair right after "GIF87a" / "GIF89a".
      if (decoded.length < 10 || !/^GIF8[79]a/.test(decoded)) return null
      width = view.getUint16(6, true)
      height = view.getUint16(8, true)
    }
    return width > 0 && height > 0 ? { width, height } : null
  } catch {
    return null
  }
}

const IMAGE_CAPABILITY_PROVIDER_NAMES: Record<ImageCapability, string> = {
  image2: 'GPT Image',
  grok: 'Grok',
  banner: 'Gemini（Banana）',
}

function localizeSvgGenerationError(message: string) {
  if (/svg\s+generation\s+requires\b/i.test(message)) {
    return 'SVG 生成请求未通过校验。请点击“带回参数重试”；若仍失败，请切换创作分组，或改用 PNG / JPEG / WebP 格式。'
  }
  return message
}

function creatorGenerationErrorMessage(
  error: unknown,
  mode: StudioMode = studioMode.value,
  capability: ImageCapability = imageCapability.value,
  videoModel = '',
) {
  const message = localizeSvgGenerationError(errorMessage(error, '生成失败'))
  if (mode === 'video' || capability === 'grok') {
    if (isRetryableGrokTransientError(error)) {
      const videoProvider = videoProviderLabel(videoModel)
      return mode === 'video'
        ? `${videoProvider} 视频上游暂时不可用，系统已自动重试 ${VIDEO_SUBMISSION_RETRY_DELAYS_MS.length} 次。请稍后带回参数重试；如果频繁出现，请为当前分组增加可用 ${videoProvider} 账号。`
        : 'Grok 上游服务暂时不可用，系统已自动重试一次。请稍后再试；如果频繁出现，请为该分组增加可用 Grok 账号。'
    }
    if (mode === 'video') return message
  } else {
    // Only Grok image requests are auto-retried; other providers must name
    // their own upstream instead of reusing the Grok-specific hint.
    const provider = IMAGE_CAPABILITY_PROVIDER_NAMES[capability]
    if (isNoAvailableAccountError(error)) {
      return `当前创作分组暂无可用的 ${provider} 账号，请切换创作分组或稍后重试；如果频繁出现，请为该分组增加可用 ${provider} 账号。`
    }
    if (isRetryableGrokTransientError(error)) {
      return `${provider} 上游服务暂时不可用，请稍后点击“带回参数重试”；如果频繁出现，请检查该分组的 ${provider} 账号状态。`
    }
  }
  if (/output_format/i.test(message) && /invalid|unsupported|not supported|无效|不支持/i.test(message)) {
    return `当前上游渠道不支持所选输出格式（GIF / SVG 需要上游支持 GPT Image 2.6 官方参数）。请切换创作分组或渠道，或改用 PNG / JPEG / WebP。上游返回：${message}`
  }
  if (/fixed\s+4K\s+SKU.*size\s+requests/i.test(message)) {
    return '当前创作分组把请求路由到了固定 4K 图片模型，但所选尺寸不是 4K。请重试，或切换创作分组/输出尺寸。'
  }
  if (/only supports\s+n\s*=\s*1|supports\s+n\s*=\s*1/i.test(message)) {
    return '当前图片模型每次请求只能生成 1 张图片；系统已自动按单张请求处理。若仍失败，请切换创作分组或稍后重试。'
  }
  if (/unknown parameter:\s*["']?tools\[0\]\.n|tools\[0\]\.n/i.test(message)) {
    return '当前图片通道不支持批量参数；系统已自动改为逐张生成。请点击“带回参数重试”。'
  }
  if (/no available compatible accounts/i.test(message)) {
    return '当前创作分组没有可用的兼容图片账号，请切换创作分组或稍后重试。'
  }
  if (/(?:size|resolution).*(?:not supported|unsupported|invalid)|unsupported.*(?:size|resolution)/i.test(message)) {
    return '当前 gpt-image-2 图片通道不支持所选 4K 尺寸，请切换创作分组或改用 1K / 2K。'
  }
  if (/timeout|timed out|deadline exceeded|network|upstream request failed|gateway timeout|连接|超时|网络/i.test(message)) {
    return '图片模型响应较慢或网络暂时不稳定，网关会自动切换可用通道。请稍后点击“带回参数重试”，不要连续重复提交。'
  }
  return message
}

function isRetryableGrokTransientError(error: unknown) {
  const candidate = typeof error === 'object' && error
    ? error as { status?: number; code?: string | number; message?: string; error?: { message?: string } }
    : {}
  const status = Number(candidate.status || candidate.code)
  if ([502, 503, 504].includes(status)) return true
  return /upstream service temporarily unavailable|service temporarily unavailable|service unavailable|bad gateway/i.test(
    candidate.error?.message || candidate.message || '',
  )
}

// The gateway answers an empty or exhausted account pool with 503
// "No available accounts" or the generic "Service temporarily unavailable".
function isNoAvailableAccountError(error: unknown) {
  const candidate = typeof error === 'object' && error
    ? error as { status?: number; code?: string | number; message?: string; error?: { message?: string } }
    : {}
  const text = candidate.error?.message || candidate.message || ''
  // "No available compatible accounts" keeps its dedicated hint below.
  if (/no available accounts/i.test(text)) return true
  const status = Number(candidate.status || candidate.code)
  return status === 503 && /^service temporarily unavailable\.?$/i.test(text.trim())
}

async function generateVideoWork(work: CreatorHistoryItem, input: VideoGenerationSnapshot, task: GenerationTask, resumed?: ResumedVideoShots) {
  const key = input.apiKey
  const shots = input.shots
  const multiShot = shots.length > 1
  const relayVideo = isMiniMaxH3Model(input.model) || isSeedanceVideoModel(input.model)
  // Every shot runs at the same time and finishes in any order, so its state is
  // kept by original shot index. A failed shot is dropped so the finished shots
  // remain usable.
  const requestIdByShot = new Map<number, string>()
  const blobByShot = new Map<number, Blob>()
  const urlByShot = new Map<number, string>()
  const failedShots = new Set<number>(resumed?.failedShots)
  let lastError: unknown = resumed?.lastError
  for (const [position, shotIndex] of (resumed?.shotIndexes || []).entries()) {
    requestIdByShot.set(shotIndex, resumed!.requestIds[position])
    const blob = resumed!.outputBlobs[position]
    if (blob) {
      blobByShot.set(shotIndex, blob)
      urlByShot.set(shotIndex, createTrackedObjectUrl(blob))
    }
  }
  const isSettled = (index: number) => requestIdByShot.has(index) || failedShots.has(index)
  const syncShotState = () => {
    const submitted = [...requestIdByShot.keys()].sort((left, right) => left - right)
    // Finished shots come first, so outputs[i] always belongs to
    // shotOutputIndexes[i] while later shots are still rendering.
    const finished = submitted.filter(index => blobByShot.has(index))
    const ordered = [...finished, ...submitted.filter(index => !blobByShot.has(index))]
    work.requestId = ordered.map(index => requestIdByShot.get(index)!).join(',') || undefined
    work.shotOutputIndexes = ordered
    work.outputs = finished.map(index => urlByShot.get(index)!)
    work.videoBlobs = finished.map(index => blobByShot.get(index)!)
    // Replace rather than mutate: history copies share this object.
    if (work.shotQueue) {
      // A refresh resumes the queue until every shot has finished, so shots
      // that complete out of order are still collected by shot number.
      const firstOpen = shots.findIndex((_, index) => !blobByShot.has(index) && !failedShots.has(index))
      work.shotQueue = {
        nextIndex: firstOpen === -1 ? shots.length : firstOpen,
        failedIndexes: [...failedShots].sort((left, right) => left - right),
        failureReason: lastError === undefined ? undefined : errorMessage(lastError, '视频生成失败'),
        // Submitted shots no longer need their reference images.
        referenceBlobs: work.shotQueue.referenceBlobs.map((blobs, index) => isSettled(index) ? [] : blobs),
      }
    }
    work.updatedAt = Date.now()
  }

  // A single shot reports straight into the task. Multiple shots each get their
  // own progress, and the task shows their average.
  const shotTasks = shots.map((_, index) => multiShot
    ? reactive<GenerationTask>({
      id: `${task.id}:${index}`,
      mode: task.mode,
      prompt: shots[index].prompt,
      phase: requestIdByShot.has(index) ? 'generating' : 'submitting',
      hasExactProgress: false,
      percent: blobByShot.has(index) || failedShots.has(index) ? 100 : 0,
      progress: '',
      startedAt: Date.now(),
    })
    : task)
  // Initialize reactive shot outputs for the UI to track finished shots.
  if (multiShot) {
    task.shotOutputs = reactive(new Map())
    task.failedShots = reactive(new Set(failedShots))
    for (const [index, url] of urlByShot.entries()) {
      task.shotOutputs.set(index, url)
    }
  }
  const refreshProgress = () => {
    if (!multiShot) return
    const finished = blobByShot.size
    const failedNote = failedShots.size ? `，${failedShots.size} 个失败` : ''
    task.phase = shotTasks.some(shotTask => shotTask.phase === 'generating') ? 'generating' : 'submitting'
    task.hasExactProgress = shotTasks.some(shotTask => shotTask.hasExactProgress)
    const average = shotTasks.reduce((sum, shotTask) => sum + shotTask.percent, 0) / shots.length
    task.percent = Math.max(task.percent, Math.min(99, Math.round(average)))
    task.progress = `正在同时生成 ${shots.length} 个镜头（已完成 ${finished} 个${failedNote}）`
  }
  const stopProgressWatch = multiShot
    ? watch(() => shotTasks.map(shotTask => [shotTask.percent, shotTask.phase, shotTask.hasExactProgress]), refreshProgress, { flush: 'sync' })
    : undefined

  const submitShot = async (index: number, shotTask: GenerationTask) => {
    const shot = shots[index]
    const imageDataUrls = await Promise.all(shot.referenceFiles.map(fileToDataUrl))
    const sourceImage = shot.generationMethod === 'image' ? imageDataUrls[0] : undefined
    const imageDataUrl = sourceImage && !shot.followSourceAspect
      ? await cropSourceImageToRatio(sourceImage, shot.aspectRatio)
      : sourceImage
    const referenceImageDataUrls = shot.generationMethod === 'reference' ? imageDataUrls : undefined
    shotTask.phase = 'submitting'
    shotTask.hasExactProgress = false
    if (!multiShot) task.progress = '正在提交视频任务，请稍候'
    const request = {
      model: input.model,
      prompt: shot.prompt,
      duration: shot.duration,
      resolution: shot.resolution,
      aspectRatio: shot.aspectRatio,
      imageDataUrl,
      referenceImageDataUrls,
    }
    let created: Awaited<ReturnType<typeof createCreatorVideo>>
    for (let attempt = 0; ; attempt++) {
      try {
        created = await createCreatorVideo(key, request)
        break
      } catch (error) {
        if (!isRetryableGrokTransientError(error) || attempt >= VIDEO_SUBMISSION_RETRY_DELAYS_MS.length) throw error
        const retryNumber = attempt + 1
        const retryDelay = VIDEO_SUBMISSION_RETRY_DELAYS_MS[attempt]
        const delaySeconds = retryDelay / 1000
        shotTask.progress = multiShot
          ? `镜头 ${index + 1} 上游暂时不可用，${delaySeconds} 秒后自动重试（${retryNumber}/${VIDEO_SUBMISSION_RETRY_DELAYS_MS.length}）`
          : `${videoProviderLabel(input.model)} 上游暂时不可用，${delaySeconds} 秒后自动重试（${retryNumber}/${VIDEO_SUBMISSION_RETRY_DELAYS_MS.length}）`
        await delay(retryDelay)
        shotTask.progress = multiShot ? `正在重新提交镜头 ${index + 1}` : '正在重新提交视频任务'
      }
    }
    if (!created.id) throw new Error('视频接口没有返回任务 ID')
    // Receiving an ID only means the task entered the provider queue. Keep the
    // percentage hidden until polling confirms that rendering has started.
    shotTask.phase = 'generating'
    shotTask.hasExactProgress = false
    if (!multiShot) task.progress = '任务已提交，正在等待生成'
    return created.id
  }

  // Submits (or, after a refresh, picks up) one shot and saves its video to
  // this browser as soon as it finishes, without waiting for the other shots.
  const runShot = async (index: number) => {
    const shotTask = shotTasks[index]
    try {
      let requestId = requestIdByShot.get(index)
      if (!requestId) {
        requestId = await submitShot(index, shotTask)
        requestIdByShot.set(index, requestId)
        syncShotState()
        await persistWork(work)
      }
      shotTask.phase = 'generating'
      // Relay videos can take up to 30 minutes; keep polling longer than for Grok.
      const videoBlob = await waitForVideo(key, requestId, multiShot ? 0 : index, multiShot ? 1 : shots.length, shotTask, relayVideo ? 450 : 150)
      blobByShot.set(index, videoBlob)
      const url = createTrackedObjectUrl(videoBlob)
      urlByShot.set(index, url)
      shotTask.percent = 100
      // Update task's reactive shot outputs so the UI shows the finished video immediately.
      if (multiShot && task.shotOutputs) task.shotOutputs.set(index, url)
      syncShotState()
      await persistWork(work)
    } catch (error) {
      // A single-shot video, or a closed page, still fails as a whole.
      if (!multiShot || disposed) throw error
      // Download interruptions keep the requestId so the user can reload later;
      // upstream failures delete it because retrying won't help.
      const isDownloadFailure = error instanceof VideoContentDownloadError
      lastError = error
      failedShots.add(index)
      if (!isDownloadFailure) requestIdByShot.delete(index)
      shotTask.percent = 100
      // Update task's reactive failed shots so the UI marks the shot as failed immediately.
      if (task.failedShots) task.failedShots.add(index)
      syncShotState()
      await persistWork(work)
    }
    refreshProgress()
  }

  const pendingShots = shots.map((_, index) => index).filter(index => !blobByShot.has(index) && !failedShots.has(index))
  refreshProgress()
  try {
    const settled = await Promise.allSettled(pendingShots.map(runShot))
    const fatal = settled.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    if (fatal) throw fatal.reason
  } finally {
    stopProgressWatch?.()
  }
  syncShotState()
  const outputBlobs = work.videoBlobs || []
  // Every shot is settled; nothing is left to resume.
  work.shotQueue = undefined
  if (!work.outputs.length) throw lastError ?? new Error('视频生成失败')
  if (failedShots.size) {
    const reason = creatorGenerationErrorMessage(lastError, 'video', undefined, input.model)
    const failedLabels = [...failedShots].sort((left, right) => left - right).map(index => index + 1).join('、')
    work.error = `已生成 ${work.outputs.length} / ${shots.length} 段，其余 ${failedShots.size} 段生成失败（镜头 ${failedLabels}）：${reason}`
  }
  if (outputBlobs.length > 1) {
    task.progress = failedShots.size ? '已完成的镜头正在合成完整视频' : '所有镜头已完成，正在合成完整视频'
    await composeWorkVideo(work, outputBlobs, false)
  }
}

async function waitForVideo(apiKey: string, requestId: string, shotIndex: number, shotCount: number, task: GenerationTask, maxAttempts = 150) {
  let monotonicProgress = task.percent

  const updateProgress = (candidate: number) => {
    monotonicProgress = Math.max(monotonicProgress, Math.max(0, Math.min(100, candidate)))
    task.percent = monotonicProgress
  }

  let consecutiveStatusFailures = 0
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (disposed) throw new Error('页面已关闭，任务可稍后从历史记录继续查看')
    if (attempt > 0) await delay(4000)
    let status: Awaited<ReturnType<typeof getCreatorVideoStatus>>
    try {
      status = await getCreatorVideoStatus(apiKey, requestId)
      consecutiveStatusFailures = 0
    } catch (error) {
      if (!isRetryableGrokTransientError(error)) throw error
      consecutiveStatusFailures++
      if (consecutiveStatusFailures >= VIDEO_STATUS_MAX_CONSECUTIVE_FAILURES) {
        throw new Error('视频任务已提交，但状态查询连续失败。任务可能仍在生成，请稍后在历史记录中重新打开该作品查看结果，不要重复提交。')
      }
      task.progress = `任务状态查询暂时失败，正在自动重试（${consecutiveStatusFailures}/${VIDEO_STATUS_MAX_CONSECUTIVE_FAILURES - 1}）`
      continue
    }
    const normalized = String(status.status || '').toLowerCase()
    const rawProgress: unknown = status.progress
    const hasReportedProgress = rawProgress !== undefined
      && rawProgress !== null
      && rawProgress !== ''
      && Number.isFinite(Number(rawProgress))
    const reportedProgress = hasReportedProgress ? Number(rawProgress) : Number.NaN
    if (['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(normalized)) {
      throw new Error(errorMessage(status.error, '视频生成失败'))
    }
    if (['completed', 'succeeded', 'success', 'done'].includes(normalized) || status.url) {
      task.phase = 'generating'
      task.hasExactProgress = true
      updateProgress(Math.round((shotIndex + 1) / shotCount * 100))
      task.progress = shotCount > 1 ? `镜头 ${shotIndex + 1} 已完成，正在加载视频` : '视频已生成，正在加载结果'
      return downloadFinishedVideo(apiKey, requestId, task)
    }
    const isQueued = ['queued', 'pending', 'submitted', 'created', 'waiting'].includes(normalized)
    const isGeneratingStatus = ['processing', 'running', 'in_progress', 'generating', 'rendering'].includes(normalized)
    // Some Grok status responses remain `pending` while already reporting a
    // real 1-99 progress value. Treat that as rendering, but keep queued 0/100
    // values indeterminate because providers also use them as state markers.
    const hasUsableReportedProgress = hasReportedProgress && reportedProgress >= 1 && reportedProgress < 100
    const isGenerating = isGeneratingStatus || hasUsableReportedProgress || (!isQueued && hasReportedProgress)
    task.phase = 'generating'
    task.hasExactProgress = isGenerating
    if (task.hasExactProgress) {
      const shotStartProgress = Math.min(99, Math.round(shotIndex / shotCount * 100) + 1)
      updateProgress(shotStartProgress)
      // A few providers reuse 100 as a queue/state code before rendering starts.
      // Ignore it for every non-terminal response and reserve 100% for completion.
      if (reportedProgress >= 1 && reportedProgress < 100) {
        const exactShotProgress = Math.max(0, reportedProgress)
        updateProgress(Math.round((shotIndex + exactShotProgress / 100) / shotCount * 100))
      } else {
        // Some providers expose only processing/completed states. Advance a
        // conservative estimate so the UI does not sit at 1% and jump to 100%.
        const elapsedSeconds = Math.max(0, (Date.now() - task.startedAt) / 1000 - 6)
        const estimatedShotProgress = Math.min(95, Math.max(
          1,
          Math.round(1 + 94 * Math.pow(Math.min(1, elapsedSeconds / 90), 1.5)),
        ))
        updateProgress(Math.round((shotIndex + estimatedShotProgress / 100) / shotCount * 100))
      }
    }
    task.progress = shotCount > 1
      ? isGenerating
        ? `正在按镜头顺序生成画面 · ${shotIndex + 1} / ${shotCount}`
        : `镜头 ${shotIndex + 1} 正在排队 · 共 ${shotCount} 个镜头`
      : isGenerating
        ? '正在按镜头顺序生成画面，请稍候'
        : '任务正在排队，请稍候'
  }
  throw new Error('视频生成等待超时，请稍后刷新历史记录')
}

async function downloadFinishedVideo(apiKey: string, requestId: string, task: GenerationTask) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getCreatorVideoContent(apiKey, requestId)
    } catch (error) {
      if (disposed || isMissingVideoRequest(error)) throw error
      if (attempt >= VIDEO_CONTENT_RETRY_DELAYS_MS.length) throw new VideoContentDownloadError(VIDEO_CONTENT_DOWNLOAD_FAILED_MESSAGE)
      task.progress = `视频下载中断，正在自动重试（${attempt + 1}/${VIDEO_CONTENT_RETRY_DELAYS_MS.length}）`
      await delay(VIDEO_CONTENT_RETRY_DELAYS_MS[attempt])
    }
  }
}

async function persistWork(work: CreatorHistoryItem, expectedUpdatedAt?: number) {
  if (work.type === 'video') await captureVideoBlobsForPersistence(work)
  const storedWork = {
    ...work,
    outputs: work.outputs.filter(output => !output.startsWith('blob:')),
    mergedOutput: work.mergedOutput?.startsWith('blob:') ? undefined : work.mergedOutput,
  }
  const saved = expectedUpdatedAt === undefined
    ? await creatorHistory.put(storedWork)
    : await creatorHistory.put(storedWork, expectedUpdatedAt)
  if (saved === false) {
    localSaveWarning.value = '浏览器空间不足或本地存储不可用：部分作品仅在本次页面中保留，请立即下载原图；刷新后可能丢失。'
  }
  return saved
}

function cloneWork(work: CreatorHistoryItem): CreatorHistoryItem {
  return {
    ...work,
    outputs: [...work.outputs],
    upstreamImageSizes: work.upstreamImageSizes ? [...work.upstreamImageSizes] : undefined,
    imageOutputSizes: work.imageOutputSizes ? [...work.imageOutputSizes] : undefined,
    videoBlobs: work.videoBlobs ? [...work.videoBlobs] : undefined,
    shotPrompts: work.shotPrompts ? [...work.shotPrompts] : undefined,
    shotDurations: work.shotDurations ? [...work.shotDurations] : undefined,
    shotAspectRatios: work.shotAspectRatios ? [...work.shotAspectRatios] : undefined,
    shotResolutions: work.shotResolutions ? [...work.shotResolutions] : undefined,
    shotGenerationMethods: work.shotGenerationMethods ? [...work.shotGenerationMethods] : undefined,
    shotReferenceCounts: work.shotReferenceCounts ? [...work.shotReferenceCounts] : undefined,
    shotFollowSourceAspects: work.shotFollowSourceAspects ? [...work.shotFollowSourceAspects] : undefined,
    shotActualOutputSizes: work.shotActualOutputSizes ? [...work.shotActualOutputSizes] : undefined,
    shotOutputIndexes: work.shotOutputIndexes ? [...work.shotOutputIndexes] : undefined,
    imageTaskIds: work.imageTaskIds ? [...work.imageTaskIds] : undefined,
  }
}

async function captureVideoBlobsForPersistence(work: CreatorHistoryItem) {
  if (work.outputs.length && work.videoBlobs?.length !== work.outputs.length) {
    const blobs = await Promise.all(work.outputs.map(async (output, index) => {
      if (!output.startsWith('blob:')) return work.videoBlobs?.[index]
      try {
        const response = await fetch(output)
        return response.ok ? await response.blob() : undefined
      } catch {
        return undefined
      }
    }))
    if (blobs.every((blob): blob is Blob => blob instanceof Blob)) work.videoBlobs = blobs
  }
  if (work.mergedOutput?.startsWith('blob:') && !work.mergedVideoBlob) {
    try {
      const response = await fetch(work.mergedOutput)
      if (response.ok) work.mergedVideoBlob = await response.blob()
    } catch {
      // The merged video can be recreated from its persisted segments.
    }
  }
}

// IndexedDB returns new Blob instances on every read. Keep the ones already in
// memory when the bytes are unchanged so the blob: URL (and the <video>) stays.
function sameVideoBlob(left?: Blob, right?: Blob) {
  return Boolean(left && right && left.size === right.size && left.type === right.type)
}

function reuseLoadedVideoBlobs(work: CreatorHistoryItem, previous?: CreatorHistoryItem) {
  if (work.type !== 'video' || !previous || previous === work || previous.requestId !== work.requestId) return
  const previousBlobs = previous.videoBlobs
  if (previousBlobs && work.videoBlobs?.length === previousBlobs.length
    && work.videoBlobs.every((blob, index) => sameVideoBlob(blob, previousBlobs[index]))) {
    work.videoBlobs = [...previousBlobs]
  }
  if (sameVideoBlob(work.mergedVideoBlob, previous.mergedVideoBlob)) work.mergedVideoBlob = previous.mergedVideoBlob
}

function restorePersistedVideoOutputs(work: CreatorHistoryItem) {
  if (work.type !== 'video') return
  if (!work.outputs.length && work.videoBlobs?.length) {
    work.outputs = work.videoBlobs.map(createTrackedObjectUrl)
  }
  if (!work.mergedOutput && work.mergedVideoBlob) {
    work.mergedOutput = createTrackedObjectUrl(work.mergedVideoBlob)
  }
}

function findKeyForWork(work: CreatorHistoryItem) {
  const recoveryKeys = apiKeys.value.filter(key => ['active', 'quota_exhausted', 'expired'].includes(key.status))
  const exactKeys = recoveryKeys.filter(key => key.id === work.apiKeyId)
  if (work.apiKeyId) {
    const exactKey = exactKeys.find(key => key.status === 'active') || exactKeys[0]
    if (exactKey) return exactKey
  }
  if (work.groupId) {
    const groupKey = recoveryKeys.find(key => key.group_id === work.groupId && key.status === 'active')
      || recoveryKeys.find(key => key.group_id === work.groupId)
    if (groupKey) return groupKey
  }
  const namedGroup = groups.value.find(item => item.name === work.groupName)
  if (namedGroup) {
    const namedGroupKey = recoveryKeys.find(key => key.group_id === namedGroup.id && key.status === 'active')
      || recoveryKeys.find(key => key.group_id === namedGroup.id)
    if (namedGroupKey) return namedGroupKey
  }
  const namedKey = recoveryKeys.find(key => key.group?.name === work.groupName && key.status === 'active')
    || recoveryKeys.find(key => key.group?.name === work.groupName)
  if (namedKey) return namedKey

  // Creator history from versions before groupId/apiKeyId cannot survive a
  // group rename. Only fall back when the restored group has one unambiguous
  // active key; the video request is still authorized by that user key.
  const selectedGroupKeys = recoveryKeys.filter(key => key.group_id === selectedGroupId.value)
  if (selectedGroupKeys.length === 1) return selectedGroupKeys[0]
  return null
}

function createTrackedObjectUrl(blob: Blob) {
  // History notifications strip blob: outputs. Reuse the URL for the same
  // bytes, otherwise every save remounts the <video> and restarts loading.
  const existing = blobObjectUrls.get(blob)
  if (existing) return existing
  const objectUrl = URL.createObjectURL(blob)
  transientObjectUrls.add(objectUrl)
  blobObjectUrls.set(blob, objectUrl)
  return objectUrl
}

// Opening a work from the drawer closes it and returns the page to the top.
function openHistoryWork(work: CreatorHistoryItem) {
  const fromDrawer = compactHistory.value && historyDrawerOpen.value
  historyDrawerOpen.value = false
  void selectWork(work)
  // Wait for the drawer watcher to release the body scroll lock.
  if (fromDrawer) void nextTick(() => { window.scrollTo?.({ top: 0, behavior: 'smooth' }) })
}

watch(historyDrawerOpen, open => {
  bodyScrollLocked.value = open
  historyDragOffset.value = 0
  if (open) void nextTick(() => focusHistoryClose())
  else if (document.activeElement === document.body || document.getElementById('creator-history-panel')?.contains(document.activeElement)) {
    historyToggleElement.value?.focus({ preventScroll: true })
  }
})
watch(compactHistory, compact => { if (!compact) historyDrawerOpen.value = false })

// Chromium rejects focus() for about a frame after the panel stops being inert; retry until it sticks.
function focusHistoryClose(attempts = 4) {
  const close = historyCloseElement.value
  if (!historyDrawerOpen.value || !close) return
  close.focus()
  if (document.activeElement !== close && attempts > 1) requestAnimationFrame(() => focusHistoryClose(attempts - 1))
}

// Swipe the phone sheet down to close it; drags inside the list keep scrolling the list.
let historyDragStartY: number | null = null
function startHistoryDrag(event: TouchEvent) {
  const target = event.target as Element | null
  historyDragStartY = phoneHistory.value && historyDrawerOpen.value && !target?.closest('.history-list')
    ? event.touches[0].clientY
    : null
}
function moveHistoryDrag(event: TouchEvent) {
  if (historyDragStartY === null) return
  historyDragOffset.value = Math.max(0, event.touches[0].clientY - historyDragStartY)
}
function endHistoryDrag() {
  if (historyDragStartY === null) return
  historyDragStartY = null
  if (historyDragOffset.value > 80) historyDrawerOpen.value = false
  historyDragOffset.value = 0
}

async function selectWork(work: CreatorHistoryItem) {
  if (studioMode.value !== work.type) modeSelections[studioMode.value] = selectedWork.value?.id || null
  restorePersistedVideoOutputs(work)
  selectedWork.value = work
  if (videoHistoryFeedback.value?.workId !== work.id) videoHistoryFeedback.value = null
  const needsMergedVideo = hasCompleteVideo(work) && !work.mergedOutput
  const shouldRefreshVideo = !activeGenerations.has(work.id) && work.type === 'video'
    && Boolean(work.requestId)
    && (work.status === 'pending' || !work.outputs.length || needsMergedVideo)
  if (shouldRefreshVideo) loadingVideoWorkId.value = work.id
  await restoreWorkSettings(work)
  if (work.type === 'image' && !activeGenerations.has(work.id)) {
    await preserveHistoricalImage(work)
    if (work.imagePersistenceError) localSaveWarning.value = work.imagePersistenceError
    await readHistoricalImageSizes(selectedWork.value?.id === work.id ? selectedWork.value : work)
    // A refreshed page reattaches to the server-side image tasks right away.
    if (work.status === 'pending' && work.imageTaskIds?.length) void resumeImageWork(work)
  }
  // A refreshed page resumes submitting a multi-shot video's remaining shots.
  if (!activeGenerations.has(work.id) && work.type === 'video'
    && work.status === 'pending' && work.shotQueue && work.shotQueue.nextIndex < (work.shotCount || 0)) {
    void resumeVideoShotQueue(work)
    return
  }
  if (shouldRefreshVideo) await refreshVideoWork(work, true)
}

// Reloading from an error card keeps the spinner inside that same card, then
// the finished video replaces it directly instead of flashing a separate loading card.
const reloadingVideoInPlaceId = ref('')
function isLoadingSelectedVideo(work: CreatorHistoryItem) {
  return loadingVideoWorkId.value === work.id || reloadingVideoInPlaceId.value === work.id
}
async function reloadVideoInPlace(work: CreatorHistoryItem) {
  if (checkingVideoHistory.value) return
  reloadingVideoInPlaceId.value = work.id
  try {
    await refreshVideoWork(work)
  } finally {
    if (reloadingVideoInPlaceId.value === work.id) reloadingVideoInPlaceId.value = ''
  }
}

// A manual check of a still-rendering task resumes live polling, so progress
// lost to a page refresh is shown again until the video loads.
async function refreshVideoWork(work: CreatorHistoryItem, quiet = false, resume = !quiet) {
  if (checkingVideoHistory.value || activeGenerations.has(work.id) || !work.requestId) {
    if (loadingVideoWorkId.value === work.id) loadingVideoWorkId.value = ''
    return
  }
  if (work.status === 'completed' && !work.outputs.length) loadingVideoWorkId.value = work.id
  const key = findKeyForWork(work)
  if (!key) {
    const message = '未找到该作品分组对应的可用 Key，暂时无法同步状态。'
    const alreadyReported = videoHistoryFeedback.value?.workId === work.id
      && videoHistoryFeedback.value.tone === 'error'
      && videoHistoryFeedback.value.message === message
    videoHistoryFeedback.value = { workId: work.id, tone: 'error', message }
    if (loadingVideoWorkId.value === work.id) loadingVideoWorkId.value = ''
    if (!quiet && !alreadyReported) appStore.showError(message)
    return
  }
  const matchedGroup = groups.value.find(group => group.id === key.group_id) || key.group
  work.apiKeyId = key.id
  if (key.group_id) work.groupId = key.group_id
  if (matchedGroup?.name) work.groupName = matchedGroup.name
  checkingVideoHistory.value = true
  videoHistoryFeedback.value = null
  let resumeWork: CreatorHistoryItem | undefined
  const loadedBlobs = new Map<string, Blob>()
  try {
    const outputs: string[] = []
    const outputBlobs: Blob[] = []
    const keptRequestIds: string[] = []
    const keptShotIndexes: number[] = []
    let pending = false
    let pendingProgress: number | undefined
    let failedError = ''
    const requestIds = work.requestId.split(',').map(id => id.trim()).filter(Boolean)
    // Only works that track per-shot outputs may keep finished shots when a
    // later shot fails; older records still fail as a whole.
    const tracksShots = Boolean(work.shotOutputIndexes) && requestIds.length === work.shotOutputIndexes?.length
    for (const [requestIndex, requestId] of requestIds.entries()) {
      const status = await getCreatorVideoStatus(key.key, requestId)
      const normalized = String(status.status || '').toLowerCase()
      if (['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(normalized)) {
        failedError = normalized === 'expired'
          ? '该视频任务已过期，无法继续查询。请带回原参数重新生成。'
          : videoHistoryErrorMessage(status.error, '视频生成失败，请带回原参数重试。')
        continue
      }
      keptRequestIds.push(requestId)
      if (tracksShots) keptShotIndexes.push(work.shotOutputIndexes![requestIndex])
      if (['completed', 'succeeded', 'success', 'done'].includes(normalized) || status.url) {
        const blob = await getCreatorVideoContent(key.key, requestId)
        loadedBlobs.set(requestId, blob)
        outputBlobs.push(blob)
        outputs.push(createTrackedObjectUrl(blob))
      } else {
        if (!pending && Number(status.progress) >= 1 && Number(status.progress) < 100) pendingProgress = Math.round(Number(status.progress))
        pending = true
      }
    }
    if (failedError && (!tracksShots || !keptRequestIds.length)) {
      work.status = 'failed'
      work.error = failedError
    } else if (failedError) {
      work.requestId = keptRequestIds.join(',')
      work.shotOutputIndexes = keptShotIndexes
      const total = resultOutputCount(work)
      work.error = `已生成 ${keptRequestIds.length} / ${total} 段，其余 ${total - keptRequestIds.length} 段生成失败：${failedError}`
    }
    if (outputs.length) {
      work.outputs = outputs
      work.videoBlobs = outputBlobs
    }
    // A work failed only by an interrupted download recovers once every task loads.
    const recovered = work.status === 'failed' && !failedError && outputs.length > 0 && outputs.length === requestIds.length
    if (recovered) work.error = undefined
    if (work.status !== 'failed' || recovered) work.status = pending ? 'pending' : 'completed'
    if (work.status === 'completed' && outputBlobs.length > 1) {
      await composeWorkVideo(work, outputBlobs, !quiet)
    }
    if (work.status === 'completed' && !work.completedAt) {
      work.completedAt = Date.now()
      work.generationDurationMs = Math.max(0, work.completedAt - work.createdAt)
    }
    work.updatedAt = Date.now()
    await persistWork(work)
    historyItems.value = historyItems.value.map(item => item.id === work.id ? cloneWork(work) : item)
    if (selectedWork.value?.id === work.id) selectedWork.value = historyItems.value.find(item => item.id === work.id) || work
    if (work.status === 'failed') {
      videoHistoryFeedback.value = null
      if (!quiet) appStore.showError(work.error || '视频生成失败，请带回原参数重试。')
    } else if (pending && resume) {
      resumeWork = historyItems.value.find(item => item.id === work.id) || work
    } else if (pending) {
      const progressNote = pendingProgress === undefined ? '' : `，当前进度 ${pendingProgress}%`
      const message = `${formatVideoStatusCheckTime(work.updatedAt)} 已同步：视频还在生成中${progressNote}，稍后可再次同步。`
      videoHistoryFeedback.value = { workId: work.id, tone: 'pending', message }
      if (!quiet) appStore.showInfo('视频还在生成中，稍后可再次同步')
    } else {
      videoHistoryFeedback.value = null
      if (!quiet) appStore.showSuccess('视频已生成并加载')
    }
  } catch (error) {
    const message = videoHistoryErrorMessage(error, '任务状态检查失败，请稍后重试。')
    if (isMissingVideoRequest(error)) {
      work.status = 'failed'
      work.error = message
      work.updatedAt = Date.now()
      await persistWork(work)
      historyItems.value = historyItems.value.map(item => item.id === work.id ? cloneWork(work) : item)
      if (selectedWork.value?.id === work.id) selectedWork.value = historyItems.value.find(item => item.id === work.id) || work
      videoHistoryFeedback.value = null
    } else {
      videoHistoryFeedback.value = { workId: work.id, tone: 'error', message }
    }
    if (!quiet) appStore.showError(message)
  } finally {
    checkingVideoHistory.value = false
    if (loadingVideoWorkId.value === work.id) loadingVideoWorkId.value = ''
  }
  if (resumeWork) await resumeVideoTracking(resumeWork, key.key, loadedBlobs)
}

async function resumeVideoTracking(work: CreatorHistoryItem, apiKey: string, loadedBlobs: Map<string, Blob>) {
  const requestIds = (work.requestId || '').split(',').map(id => id.trim()).filter(Boolean)
  const task = reactive<GenerationTask>({
    id: work.id,
    mode: 'video',
    prompt: work.prompt,
    phase: 'generating',
    hasExactProgress: false,
    percent: 0,
    progress: '正在同步视频任务进度',
    startedAt: work.createdAt,
  })
  activeGenerations.set(work.id, task)
  generationClock.value = Date.now()
  if (generationTimer === undefined) {
    generationTimer = window.setInterval(() => { generationClock.value = Date.now() }, 1000)
  }
  const relayVideo = isMiniMaxH3Model(work.model) || isSeedanceVideoModel(work.model)
  let failed = false
  try {
    const blobs: Blob[] = []
    for (const [index, requestId] of requestIds.entries()) {
      blobs.push(loadedBlobs.get(requestId)
        ?? await waitForVideo(apiKey, requestId, index, requestIds.length, task, relayVideo ? 450 : 150))
    }
    work.videoBlobs = blobs
    work.outputs = blobs.map(createTrackedObjectUrl)
    if (blobs.length > 1) {
      task.progress = '所有镜头已完成，正在合成完整视频'
      await composeWorkVideo(work, blobs, true)
    }
    work.status = 'completed'
    work.completedAt = Date.now()
    work.updatedAt = work.completedAt
    work.generationDurationMs = Math.max(0, work.completedAt - work.createdAt)
    task.percent = 100
    task.progress = '作品已完成'
    await persistWork(work)
    applyHistoryUpdate(cloneWork(work))
    appStore.showSuccess('视频已生成并加载')
  } catch {
    failed = !disposed
  } finally {
    activeGenerations.delete(work.id)
    if (!activeGenerations.size && generationTimer !== undefined) {
      window.clearInterval(generationTimer)
      generationTimer = undefined
    }
  }
  // Let the one-off check classify upstream failures, expiry and timeouts.
  if (failed) await refreshVideoWork(work, false, false)
}

// Holds a cross-tab lock while a multi-shot work submits shots, so two windows
// never submit (and bill) the same shot twice. The lock of a refreshed or
// closed page is released by the browser.
function acquireVideoShotLock(workId: string): Promise<() => void> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return Promise.resolve(() => undefined)
  return new Promise(resolve => {
    locks.request(`creator-video-shots:${workId}`, () => new Promise<void>(release => resolve(release)))
      .catch(() => resolve(() => undefined))
  })
}

const resumingVideoShotQueues = new Set<string>()

// A page refresh stops a multi-shot work between shots. Collect the shots the
// previous page submitted, then submit the ones it did not reach.
async function resumeVideoShotQueue(work: CreatorHistoryItem) {
  if (resumingVideoShotQueues.has(work.id) || activeGenerations.has(work.id) || disposed) return
  const key = findKeyForWork(work)
  if (!key) {
    videoHistoryFeedback.value = { workId: work.id, tone: 'error', message: '未找到该作品分组对应的可用 Key，暂时无法继续生成剩余镜头。' }
    return
  }
  resumingVideoShotQueues.add(work.id)
  const releaseLock = await acquireVideoShotLock(work.id)
  let task: GenerationTask | undefined
  let target = work
  try {
    // Another window may have finished the work while this one waited.
    const latest = await creatorHistory.get(work.id)
    const queue = latest?.shotQueue
    if (disposed || !latest || latest.status !== 'pending' || !queue || activeGenerations.has(work.id)) return
    applyHistoryUpdate(latest)
    target = historyItems.value.find(item => item.id === work.id) || latest
    const shotCount = target.shotCount || target.shotPrompts?.length || 0
    const shots: VideoGenerationSnapshot['shots'] = Array.from({ length: shotCount }, (_, index) => ({
      prompt: target.shotPrompts?.[index] || '',
      duration: target.shotDurations?.[index] || 0,
      resolution: target.shotResolutions?.[index] || target.resolution || '720p',
      aspectRatio: target.shotAspectRatios?.[index] || target.aspectRatio || '16:9',
      followSourceAspect: target.shotFollowSourceAspects?.[index] ?? true,
      generationMethod: target.shotGenerationMethods?.[index] || 'text',
      referenceFiles: queue.referenceBlobs[index] || [],
    }))
    if (!shots.length || shots.some(shot => !shot.prompt)) return
    const requestIds = (target.requestId || '').split(',').map(id => id.trim()).filter(Boolean)
    const shotIndexes = target.shotOutputIndexes || []
    if (shotIndexes.length !== requestIds.length) return
    const outputBlobs = (target.videoBlobs || []).slice(0, requestIds.length)
    task = reactive<GenerationTask>({
      id: target.id,
      mode: 'video',
      prompt: target.prompt,
      phase: 'generating',
      hasExactProgress: false,
      percent: Math.round(outputBlobs.length / shots.length * 100),
      progress: '正在继续生成剩余镜头',
      startedAt: target.createdAt,
    })
    activeGenerations.set(target.id, task)
    generationClock.value = Date.now()
    if (generationTimer === undefined) {
      generationTimer = window.setInterval(() => { generationClock.value = Date.now() }, 1000)
    }
    if (videoHistoryFeedback.value?.workId === target.id) videoHistoryFeedback.value = null
    await generateVideoWork(target, { apiKey: key.key, model: target.model, shots }, task, {
      requestIds,
      shotIndexes,
      outputBlobs,
      failedShots: [...queue.failedIndexes],
      lastError: queue.failureReason ? new Error(queue.failureReason) : undefined,
    })
    target.status = 'completed'
    target.completedAt = Date.now()
    target.updatedAt = target.completedAt
    target.generationDurationMs = Math.max(0, target.completedAt - target.createdAt)
    task.percent = 100
    task.progress = '作品已完成'
    await persistWork(target)
    applyHistoryUpdate(cloneWork(target))
    if (missingOutputCount(target)) appStore.showWarning(target.error || `已生成 ${target.outputs.length} 段，部分镜头生成失败`)
    else appStore.showSuccess('作品生成完成')
  } catch (error) {
    target.updatedAt = Date.now()
    if (!disposed) {
      target.status = 'failed'
      target.error = creatorGenerationErrorMessage(error, 'video', undefined, target.model)
    }
    await persistWork(target)
    applyHistoryUpdate(cloneWork(target))
    if (!disposed) appStore.showError(target.error || '视频生成失败')
  } finally {
    releaseLock()
    resumingVideoShotQueues.delete(work.id)
    if (task && activeGenerations.get(target.id) === task) activeGenerations.delete(target.id)
    if (!activeGenerations.size && generationTimer !== undefined) {
      window.clearInterval(generationTimer)
      generationTimer = undefined
    }
  }
}

// Works saved as failed by a broken connection (before downloads were retried)
// may still have a finished, unbilled video upstream.
function isVideoDownloadFailure(work: CreatorHistoryItem) {
  return work.type === 'video' && Boolean(work.requestId) && !work.outputs.length
    && /failed to fetch|load failed|networkerror|network error|连接中断|视频内容不完整|视频内容为空/i.test(work.error || '')
}

function isMissingVideoRequest(error: unknown) {
  const candidate = error as { status?: number; code?: string } | null
  const message = errorMessage(error, '').toLowerCase()
  return candidate?.status === 404
    || candidate?.code === 'not_found_error'
    || /video request not found|video task not found|request does not exist/.test(message)
}

function videoHistoryErrorMessage(error: unknown, fallback: string) {
  const message = errorMessage(error, '').trim()
  const normalized = message.toLowerCase()
  if (isMissingVideoRequest(error)) {
    return '未找到该视频任务，任务可能已过期或已被视频服务清理。请带回原参数重新生成。'
  }
  if (/expired|已过期/.test(normalized)) return '该视频任务已过期，无法继续查询。请带回原参数重新生成。'
  if (/failed to fetch|network|connection|网络|连接/.test(normalized)) return '网络连接失败，暂时无法检查视频任务，请稍后重试。'
  if (/timeout|timed out|超时/.test(normalized)) return '检查视频任务超时，请稍后重试。'
  if (/temporarily unavailable|service unavailable|暂时不可用/.test(normalized)) return '视频服务暂时不可用，请稍后重试。'
  return /[\u3400-\u9fff]/.test(message) ? message : fallback
}

function formatVideoStatusCheckTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(timestamp)
}

async function composeWorkVideo(work: CreatorHistoryItem, blobs: Blob[], notifyFailure: boolean) {
  if (blobs.length < 2) return
  composingWorkId.value = work.id
  work.mergeError = undefined
  try {
    const { composeVideoSegments } = await import('@/services/videoComposer')
    const mergedBlob = await composeVideoSegments(blobs)
    work.mergedVideoBlob = mergedBlob
    work.mergedOutput = createTrackedObjectUrl(mergedBlob)
  } catch (error) {
    work.mergedOutput = undefined
    work.mergedVideoBlob = undefined
    work.mergeError = errorMessage(error, '分段素材已完成，但完整视频合成失败')
    if (notifyFailure) appStore.showWarning(work.mergeError)
  } finally {
    if (composingWorkId.value === work.id) composingWorkId.value = ''
  }
}

async function recomposeVideo(work: CreatorHistoryItem) {
  if (composingWorkId.value) return
  try {
    const blobs = await readVideoSegmentBlobs(work)
    work.videoBlobs = blobs
    await composeWorkVideo(work, blobs, true)
    work.updatedAt = Date.now()
    await persistWork(work)
    historyItems.value = historyItems.value.map(item => item.id === work.id ? cloneWork(work) : item)
    if (selectedWork.value?.id === work.id) selectedWork.value = historyItems.value.find(item => item.id === work.id) || work
    if (work.mergedOutput) appStore.showSuccess('完整视频已重新合成')
  } catch (error) {
    appStore.showError(errorMessage(error, '完整视频合成失败'))
  }
}

/**
 * Recover segments without depending on temporary object URLs. Those URLs
 * are intentionally omitted from IndexedDB and may have been revoked after a
 * refresh or a failed composition attempt; the original video task endpoint
 * remains a valid fallback while the provider retains the task.
 */
async function readVideoSegmentBlobs(work: CreatorHistoryItem): Promise<Blob[]> {
  const requestIds = (work.requestId || '').split(',').map(id => id.trim()).filter(Boolean)
  const key = requestIds.length ? findKeyForWork(work) : null

  return Promise.all(work.outputs.map(async (output, index) => {
    const persisted = work.videoBlobs?.[index]
    if (persisted instanceof Blob && persisted.size > 0) return persisted

    let outputError: unknown
    if (output) {
      try {
        const response = await fetch(output)
        if (response.ok) {
          const blob = await response.blob()
          if (blob.size > 0) return blob
        } else {
          outputError = new Error(`读取镜头素材失败：HTTP ${response.status}`)
        }
      } catch (error) {
        outputError = error
      }
    }

    const requestId = requestIds[index]
    if (key && requestId) {
      try {
        return await getCreatorVideoContent(key.key, requestId)
      } catch (error) {
        outputError = error
      }
    }

    throw outputError || new Error(`缺少第 ${index + 1} 段视频素材`)
  }))
}

async function removeWork(work: CreatorHistoryItem) {
  if (activeGenerations.has(work.id)) return
  await creatorHistory.remove(work.id)
  historyItems.value = historyItems.value.filter(item => item.id !== work.id)
  if (selectedWork.value?.id === work.id) selectedWork.value = null
  appStore.showSuccess('作品记录已删除')
}

async function restoreWorkSettings(work: CreatorHistoryItem) {
  let restoreSettingsScroll = captureSettingsScroll()
  const sequence = ++restoreSettingsSequence
  restoringWorkSettings.value = true
  const historicalVideoResolution = work.type === 'video' ? work.resolution || '720p' : ''
  try {
    if (studioMode.value !== work.type) {
      studioMode.value = work.type
      historyFilter.value = work.type
      activeTemplateIndex.value = 0
      promptTemplatePage.value = 0
    }
    clearReferenceImages()

    if (work.type === 'video') {
      videoCapability.value = videoCapabilityForModel(work.model)
    }
    if (work.type === 'image') {
      imageCapability.value = work.imageCapability || inferImageCapability(work)
      imageResolution.value = work.resolution || '1K'
      aspectRatio.value = work.aspectRatio || '1:1'
      if (imageCapability.value === 'image2') restoreImage2SizeSettings(work)
      else {
        imageSizeMode.value = 'ratio'
        if (!isImageRatioAvailable(imageResolution.value, aspectRatio.value)) aspectRatio.value = '1:1'
      }
      outputCount.value = Math.max(1, Math.min(4, work.outputCount || work.outputs.length || 1))
      imageQuality.value = work.quality || 'auto'
      outputFormat.value = work.outputFormat || 'png'
      gifFrameCount.value = clampGifSetting(work.frameCount, GIF_FRAME_COUNT_RANGE)
      gifFrameDurationMs.value = clampGifSetting(work.frameDurationMs, GIF_FRAME_DURATION_RANGE)
    } else {
      aspectRatio.value = work.aspectRatio || '16:9'
      videoResolution.value = historicalVideoResolution
      videoGenerationMethod.value = work.videoGenerationMethod
        || (work.referenceCount ? 'image' : 'text')
      videoFollowSourceAspect.value = work.shotFollowSourceAspects?.[0] ?? true
    }

    const historicalGroup = groups.value.find(group => group.id === work.groupId)
      || groups.value.find(group => group.name === work.groupName)
    if (historicalGroup && groupMatchesCurrentCapability(historicalGroup)) {
      selectedGroupId.value = historicalGroup.id
    } else {
      syncSelectedGroup()
    }

    const shotPrompts = workShotPrompts(work)
    if (work.type === 'video' && shotPrompts.length > 1) {
      professionalVideo.value = true
      videoShots.value = shotPrompts.map((shotPrompt, index) => ({
        id: crypto.randomUUID(),
        prompt: shotPrompt,
        duration: work.shotDurations?.[index] || Math.max(1, Math.round((work.requestedDuration || 8) / shotPrompts.length)),
        generationMethod: work.shotGenerationMethods?.[index] || work.videoGenerationMethod || 'text',
        referenceImages: [],
        aspectRatio: work.shotAspectRatios?.[index] || work.aspectRatio || '16:9',
        followSourceAspect: work.shotFollowSourceAspects?.[index] ?? true,
        resolution: work.shotResolutions?.[index] || historicalVideoResolution,
      }))
      selectedShotId.value = videoShots.value[0].id
      prompt.value = ''
    } else {
      professionalVideo.value = false
      prompt.value = work.prompt
      if (work.type === 'video') videoDuration.value = work.requestedDuration || work.shotDurations?.[0] || 8
    }

    restoreSettingsScroll()
    await nextTick()
    if (sequence !== restoreSettingsSequence) return
    await loadModels()
    if (sequence !== restoreSettingsSequence) return
    restoreSettingsScroll = captureSettingsScroll()
    // Reference videos keep their model when it still takes references;
    // otherwise pick a reference-capable model of the current group.
    const restoringReferenceVideo = work.type === 'video' && requiresReferenceVideo15.value && !supportsReferenceVideo(work.model)
    if (work.model && !restoringReferenceVideo) {
      if (!modelOptions.value.includes(work.model)) modelOptions.value = [work.model, ...modelOptions.value]
      selectedModel.value = work.model
    }
    if (restoringReferenceVideo) syncVideoModelForGenerationMethod()
    if (work.type === 'video') {
      videoResolution.value = videoResolutionOptions.value.includes(historicalVideoResolution)
        ? historicalVideoResolution
        : videoResolutionOptions.value.includes('720p') ? '720p' : videoResolutionOptions.value[0]
    }
  } finally {
    if (sequence === restoreSettingsSequence) {
      restoringWorkSettings.value = false
      restoreSettingsScroll()
    }
  }
}

function restoreImage2SizeSettings(work: CreatorHistoryItem) {
  const outputSize = work.outputSize || ''
  if (work.imageSizeMode === 'auto' || outputSize === 'auto') {
    imageSizeMode.value = 'auto'
    return
  }

  const knownSize = Object.values(image2SizeOptions)
    .flat()
    .find(option => option.size === outputSize)
  if (work.imageSizeMode !== 'custom' && knownSize) {
    imageSizeMode.value = 'ratio'
    const [width, height] = knownSize.size.split('x').map(Number)
    imageResolution.value = customImageResolution(width, height)
    aspectRatio.value = knownSize.value
    return
  }

  const match = /^(\d+)x(\d+)$/.exec(outputSize)
  if (match) {
    const [width, height] = normalizeCustomImageSize(Number(match[1]), Number(match[2]))
    imageSizeMode.value = 'custom'
    imageCustomWidth.value = width
    imageCustomHeight.value = height
    imageResolution.value = customImageResolution(width, height)
    aspectRatio.value = ratioForDimensions(width, height)
    return
  }
  imageSizeMode.value = 'ratio'
}

function inferImageCapability(work: CreatorHistoryItem): ImageCapability {
  const value = `${work.provider} ${work.model}`.toLowerCase()
  if (/grok|xai/.test(value)) return 'grok'
  if (/image\s*2|gpt[-_ ]?image/.test(value)) return 'image2'
  return 'banner'
}

async function reuseWork(work: CreatorHistoryItem) {
  await restoreWorkSettings(work)
  const shotPrompts = workShotPrompts(work)
  if (work.type === 'video' && shotPrompts.length > 1) selectedShotId.value = videoShots.value[0].id
  selectedWork.value = null
  await nextTick()
  revealSettingsOnMobile()
}

async function regenerateWork(work: CreatorHistoryItem) {
  if (regeneratingWorkId.value) return
  regeneratingWorkId.value = work.id
  try {
    await restoreWorkSettings(work)
    const shotPrompts = workShotPrompts(work)
    if (work.type === 'video' && shotPrompts.length > 1) selectedShotId.value = videoShots.value[0].id
    selectedWork.value = null
    await nextTick()
    if (!canGenerate.value) {
      appStore.showError('无法按原参数重新生成，请检查原分组、模型和提示词是否仍然可用')
      return
    }
    void generateFromCurrentSettings('重新生成', true)
  } finally {
    regeneratingWorkId.value = ''
  }
}

async function useOutputAsReference(output: string, work: CreatorHistoryItem, index: number) {
  if (referencingOutputKey.value) return
  referencingOutputKey.value = `${work.id}:${index}`
  try {
    stopSettingsReveal()
    window.scrollTo?.({ top: 0, behavior: 'instant' })
    let blob: Blob
    if (output.startsWith('data:')) {
      blob = imageDataUrlToBlob(output)
    } else if (isCrossOriginHttpURL(output)) {
      const key = findKeyForWork(work)
      if (!key) throw new Error('未找到图片对应的可用 Key')
      blob = await loadCreatorImageBlob(key.key, output)
    } else {
      blob = await fetchImageBlob(output)
    }
    if (!blob.size) throw new Error('图片内容为空')
    if (blob.size > MAX_REFERENCE_IMAGE_SIZE_BYTES) {
      throw new Error(`图片超过 ${MAX_REFERENCE_IMAGE_SIZE_MB}MB，无法作为参考图上传`)
    }
    const extension = imageFileExtension(output)
    const mimeType = blob.type.startsWith('image/') ? blob.type : `image/${extension === 'jpg' ? 'jpeg' : extension}`
    const file = new File([blob], `creator-reference-${work.id}-${index + 1}.${extension}`, { type: mimeType })
    await restoreWorkSettings(work)
    const restoreSettingsScroll = captureSettingsScroll()
    const previousOutputFormat = outputFormat.value
    await addReferenceFiles([file])
    if (!activeReferenceImages.value.length) return
    selectedWork.value = null
    restoreSettingsScroll()
    await nextTick()
    appStore.showSuccess(previousOutputFormat === 'svg' && outputFormat.value === 'png'
      ? '已加入参考图并带回参数，输出格式已自动切换为 PNG'
      : '已将作品加入参考图，并带回当时的生成参数')
  } catch (error) {
    appStore.showError(errorMessage(error, '无法将作品加入参考图'))
  } finally {
    referencingOutputKey.value = ''
  }
}

function imageDataUrlToBlob(dataUrl: string) {
  const separator = dataUrl.indexOf(',')
  const header = separator >= 0 ? dataUrl.slice(0, separator) : ''
  const payload = separator >= 0 ? dataUrl.slice(separator + 1) : ''
  const mimeType = /^data:(image\/[^;,]+)/i.exec(header)?.[1]
  if (!mimeType || !/;base64(?:;|$)/i.test(header) || !payload) {
    throw new Error('图片数据格式无效，无法作为参考图')
  }

  let decoded: string
  try {
    decoded = window.atob(payload.replace(/\s/g, ''))
  } catch {
    throw new Error('图片数据损坏，无法作为参考图')
  }
  const bytes = new Uint8Array(decoded.length)
  for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index)
  return new Blob([bytes], { type: mimeType })
}

async function fetchImageBlob(output: string) {
  const response = await fetch(output)
  if (!response.ok) throw new Error(`读取图片失败：HTTP ${response.status}`)
  return response.blob()
}

function newCreation() {
  const restoreSettingsScroll = captureSettingsScroll()
  restoreSettingsSequence++
  restoringWorkSettings.value = false
  selectedWork.value = null
  modeSelections[studioMode.value] = null
  previewUrl.value = ''
  prompt.value = ''
  clearReferenceImages()
  if (studioMode.value === 'video') {
    videoShots.value = [{
      id: crypto.randomUUID(), prompt: '', duration: videoDuration.value,
      generationMethod: 'text', referenceImages: [],
      aspectRatio: aspectRatio.value, followSourceAspect: true, resolution: videoResolution.value,
    }]
    selectedShotId.value = videoShots.value[0].id
    videoGenerationMethod.value = 'text'
    videoFollowSourceAspect.value = true
  }
  restoreSettingsScroll()
}

function continueCreating() {
  newCreation()
}

function workShotPrompts(work: CreatorHistoryItem): string[] {
  if (work.shotPrompts?.length) return work.shotPrompts
  if (work.type !== 'video' || (work.shotCount || 1) <= 1) return [work.prompt]

  const prompts = work.prompt
    .split(/\n(?=镜头\s*\d+\s*[：:])/)
    .map(value => value.replace(/^镜头\s*\d+\s*[：:]\s*/, '').trim())
    .filter(Boolean)
  return prompts.length ? prompts : [work.prompt]
}

function isMultiShotVideo(work: CreatorHistoryItem) {
  return work.type === 'video' && Math.max(work.shotCount || 0, work.outputs.length, workShotPrompts(work).length) > 1
}

function resultOutputCount(work: CreatorHistoryItem) {
  return Math.max(1, work.outputCount || work.shotCount || work.outputs.length || 1)
}

// Images that finished before a later request failed stay usable.
function hasPartialImages(work: CreatorHistoryItem) {
  return work.type === 'image' && work.status === 'failed' && work.outputs.some(Boolean)
}

// A pending record can already hold saved images (generated in another
// window, or interrupted after saving); treat those images as a result.
function hasResultImages(work: CreatorHistoryItem) {
  return work.type === 'image' && work.outputs.some(Boolean)
}

function hasResultActions(work: CreatorHistoryItem) {
  return work.status === 'completed' || hasPartialImages(work) || (work.status === 'pending' && hasResultImages(work))
}

// Failed works can be retried as-is or abandoned for a fresh creation.
function hasRetryActions(work: CreatorHistoryItem) {
  return hasResultActions(work) || work.status === 'failed'
}

function missingOutputCount(work: CreatorHistoryItem) {
  if (work.status === 'pending' || !work.outputs.length) return 0
  // Older videos predate per-shot tracking and always held every shot.
  if (work.type === 'video' && !work.shotOutputIndexes) return 0
  return Math.max(0, resultOutputCount(work) - work.outputs.length)
}

// Output index -> original shot index; failed shots leave gaps in outputs.
function shotIndexForOutput(work: CreatorHistoryItem, index: number) {
  return work.shotOutputIndexes?.[index] ?? index
}

function videoShotTitle(work: CreatorHistoryItem, index: number) {
  const title = `${videoProviderLabel(work.model)} 视频`
  return isMultiShotVideo(work) ? `${title} · 镜头 ${shotIndexForOutput(work, index) + 1}` : title
}

function failedShotLabel(work: CreatorHistoryItem) {
  const produced = new Set(work.shotOutputIndexes || [])
  const failed = Array.from({ length: resultOutputCount(work) }, (_, index) => index).filter(index => !produced.has(index))
  return failed.length ? `镜头 ${failed.map(index => index + 1).join('、')} ` : ''
}

// A complete video needs at least two finished shots to stitch together.
function hasCompleteVideo(work: CreatorHistoryItem) {
  return isMultiShotVideo(work) && work.outputs.length > 1
}

function completedVideoDuration(work: CreatorHistoryItem) {
  if (!work.shotOutputIndexes || !work.shotDurations) return work.requestedDuration || 0
  return work.outputs.reduce((sum, _output, index) => sum + (work.shotDurations?.[shotIndexForOutput(work, index)] || 0), 0)
}

function partialImageReason(work: CreatorHistoryItem) {
  const reason = (work.error || '').replace(/^已生成 \d+ \/ \d+ [张段]，其余 \d+ [张段]生成失败(?:（[^）]*）)?：/, '')
  return reason ? `失败原因：${localizeSvgGenerationError(reason)}` : ''
}

function historyWorkTitle(work: CreatorHistoryItem) {
  const firstPrompt = workShotPrompts(work)[0] || work.prompt || '未命名作品'
  return isMultiShotVideo(work) ? `完整成片 · ${firstPrompt}` : firstPrompt
}

function resultDescription(work: CreatorHistoryItem, index: number) {
  return work.type === 'video' ? workShotPrompts(work)[shotIndexForOutput(work, index)] || work.prompt : work.prompt
}

function completeVideoDescription(work: CreatorHistoryItem) {
  const count = workShotPrompts(work).length
  if (!work.mergedOutput) return `${count} 个镜头素材已保留，合成完成后可预览或下载完整视频。`
  return `${count} 个镜头已按时间顺序拼接，完整保留每段画面与声音，可直接预览或下载。`
}

function fullPromptText(work: CreatorHistoryItem) {
  if (!isMultiShotVideo(work)) return work.prompt
  return workShotPrompts(work).map((shotPrompt, index) => `镜头 ${index + 1}：${shotPrompt}`).join('\n')
}

// Roughly three lines on a laptop-width grid; shorter prompts render in full without a toggle.
function isPromptLong(work: CreatorHistoryItem) {
  const text = fullPromptText(work) || ''
  return text.length > 150 || text.split('\n').length > 3
}

function shotDurationLabel(work: CreatorHistoryItem, index: number) {
  const duration = work.shotDurations?.[shotIndexForOutput(work, index)] || (!isMultiShotVideo(work) ? work.requestedDuration : undefined)
  return duration ? `${duration} 秒` : '分段视频'
}

function workAspectRatio(work: CreatorHistoryItem, index?: number) {
  const shotIndex = index === undefined ? 0 : shotIndexForOutput(work, index)
  const method = work.shotGenerationMethods?.[shotIndex] || work.videoGenerationMethod
  if (work.type === 'video' && method === 'image' && work.shotFollowSourceAspects?.[shotIndex] === true) return '跟随原图'
  return index === undefined
    ? work.aspectRatio || '自动画幅'
    : work.shotAspectRatios?.[shotIndex] || work.aspectRatio || '自动画幅'
}

function shotGenerationMethodLabel(work: CreatorHistoryItem, index: number) {
  const shotIndex = shotIndexForOutput(work, index)
  const method = work.shotGenerationMethods?.[shotIndex] || work.videoGenerationMethod || 'text'
  return videoGenerationMethodLabelFor(method)
}

function mergedDownloadName(work: CreatorHistoryItem) {
  return `creator-complete-${work.id}.mp4`
}

// The model can return a format other than the one selected (e.g. a GIF when the
// prompt asks for one), so label results by the bytes that actually came back.
function outputFormatLabel(output: string) {
  const type = /^data:image\/([a-z0-9.+-]+)[;,]/i.exec(output.slice(0, 32))?.[1]?.toLowerCase()
  if (!type) return ''
  if (type === 'gif') return 'GIF'
  return type === 'svg+xml' ? 'SVG' : type.toUpperCase()
}

function workOutputFormatLabel(work: CreatorHistoryItem) {
  if (work.type === 'video') return 'MP4'
  const formats = [...new Set(work.outputs.map(outputFormatLabel).filter(Boolean))]
  return formats.join(' / ') || work.outputFormat?.toUpperCase() || '未知'
}

function metaParts(...values: Array<string | undefined>) {
  return values.flatMap((value) => (value || '').split(' · ')).map((part) => part.trim()).filter(Boolean)
}

function videoResultTags(work: CreatorHistoryItem, index: number) {
  return [
    videoModelLabel(work.model),
    workAspectRatio(work, index),
    videoResolutionTierLabel(work, index),
    shotDurationLabel(work, index),
    workOutputFormatLabel(work),
    shotGenerationMethodLabel(work, index),
  ]
}

function completeVideoResultTags(work: CreatorHistoryItem) {
  return metaParts(
    videoModelLabel(work.model),
    workAspectRatio(work),
    videoResolutionTierLabel(work),
    `总时长 ${completedVideoDuration(work)} 秒`,
    `${work.outputs.length} 个镜头`,
    workOutputFormatLabel(work),
  )
}

function imageDimensionsLabel(work: CreatorHistoryItem, index: number) {
  return imageDisplayedSize(work, index).replace('x', '×')
}

function imageDisplayedSize(work: CreatorHistoryItem, index = 0) {
  if (work.type !== 'image') return ''
  return work.imageOutputSizes?.[index] || work.upstreamImageSizes?.[index] || (index === 0 ? work.actualOutputSize : '') || ''
}

function simplifyPixelRatio(size: string) {
  const match = /^(\d+)x(\d+)$/.exec(size)
  if (!match) return ''
  let width = Number(match[1])
  let height = Number(match[2])
  if (!width || !height) return ''
  let a = width
  let b = height
  while (b) [a, b] = [b, a % b]
  width /= a
  height /= a
  return `${width}:${height}`
}

function ratioValue(ratio: string) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(ratio)
  if (!match) return 0
  const width = Number(match[1])
  const height = Number(match[2])
  return width > 0 && height > 0 ? width / height : 0
}

function compactAspectRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return ''
  const standardRatios = image2RatioOptions.map(option => option.value)
  const standard = standardRatios.find(ratio => Math.abs(ratioValue(ratio) - value) / value <= 0.02)
  if (standard) return standard

  let closest = ''
  let smallestError = Infinity
  for (let width = 1; width <= 10; width++) {
    for (let height = 1; height <= 10; height++) {
      const error = Math.abs(width / height - value) / value
      if (error < smallestError) {
        closest = `${width}:${height}`
        smallestError = error
      }
    }
  }
  return closest
}

function imageAspectRatioLabel(work: CreatorHistoryItem, index = 0) {
  const requestedRatio = work.aspectRatio || ''
  const actualRatio = simplifyPixelRatio(imageDisplayedSize(work, index))
  if (!actualRatio) return compactAspectRatio(ratioValue(requestedRatio)) || '自动画幅'
  const requestedValue = ratioValue(requestedRatio)
  const actualValue = ratioValue(actualRatio)
  // Standard output sizes such as 688×1024 are rounded pixel targets for 2:3.
  // Keep the user-facing ratio as 2:3 when the pixel ratio is within 2% of it.
  if (requestedValue && actualValue && Math.abs(actualValue - requestedValue) / requestedValue <= 0.02) {
    return compactAspectRatio(requestedValue)
  }
  return compactAspectRatio(actualValue)
}

function workResolutionLabel(work: CreatorHistoryItem, index?: number) {
  const resolution = index === undefined ? work.resolution : work.shotResolutions?.[shotIndexForOutput(work, index)] || work.resolution
  const resolutionLabel = resolution || '默认清晰度'
  const actualOutputSize = work.type === 'image'
    ? imageDisplayedSize(work, index)
    : index === undefined || !isMultiShotVideo(work)
      ? work.actualOutputSize
      : work.shotActualOutputSizes?.[index]
  if (actualOutputSize) {
    return `${resolutionLabel} · ${actualOutputSize.replace('x', '×')}`
  }
  if (work.outputSize) return `${resolutionLabel} · ${work.outputSize.replace('x', '×')}`
  return resolutionLabel
}

function resultAspectRatio(work: CreatorHistoryItem, index?: number) {
  if (work.type === 'video') {
    const actualOutputSize = index === undefined || !isMultiShotVideo(work)
      ? work.actualOutputSize
      : work.shotActualOutputSizes?.[index]
    const dimensions = /^(\d+)x(\d+)$/.exec(actualOutputSize || '')
    if (dimensions && Number(dimensions[1]) > 0 && Number(dimensions[2]) > 0) {
      return `${dimensions[1]} / ${dimensions[2]}`
    }
  }
  if (work.type === 'image') {
    const ratio = simplifyPixelRatio(imageDisplayedSize(work, index || 0))
    if (ratio) {
      const [width, height] = ratio.split(':')
      return `${width} / ${height}`
    }
  }
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(workAspectRatio(work, index))
  return match ? `${match[1]} / ${match[2]}` : work.type === 'video' ? '16 / 9' : '1 / 1'
}

function resultIsLandscape(work: CreatorHistoryItem, index?: number) {
  if (work.type !== 'image') return false
  const dimensions = /^(\d+)x(\d+)$/.exec(imageDisplayedSize(work, index || 0))
  if (dimensions) return Number(dimensions[1]) > Number(dimensions[2])
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(work.aspectRatio || '')
  return !!match && Number(match[1]) > Number(match[2])
}

// Portrait and square images with a known ratio size the frame to the image so
// narrow grid cards do not letterbox; auto-ratio images keep the fixed frame.
function resultIsFitted(work: CreatorHistoryItem, index?: number) {
  return work.type === 'image' && (
    /^(\d+)x(\d+)$/.test(imageDisplayedSize(work, index || 0))
    || /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.test(work.aspectRatio || '')
  )
}

function resultMediaStyle(work: CreatorHistoryItem, index?: number) {
  if (work.type === 'video') {
    return {
      aspectRatio: resultAspectRatio(work, index),
      maxHeight: 'min(58vh, 620px)',
    }
  }
  return resultIsLandscape(work, index) || resultIsFitted(work, index) ? { aspectRatio: resultAspectRatio(work, index) } : undefined
}

function handleVideoMetadata(event: Event, work: CreatorHistoryItem, index = 0, scope = 'segment') {
  const video = event.currentTarget as HTMLVideoElement
  if (work.type !== 'video' || !video.videoWidth || !video.videoHeight) return

  const dimensions = `${video.videoWidth}x${video.videoHeight}`
  if (scope === 'segment' && isMultiShotVideo(work)) {
    const shotSizes = [...(work.shotActualOutputSizes || [])]
    if (shotSizes[index] === dimensions) return
    shotSizes[index] = dimensions
    work.shotActualOutputSizes = shotSizes
    void persistWork(work)
    return
  }
  if (work.actualOutputSize === dimensions) return
  work.actualOutputSize = dimensions
  void persistWork(work)
}

function formatCompletionDuration(work: CreatorHistoryItem) {
  const milliseconds = work.generationDurationMs ?? Math.max(0, work.updatedAt - work.createdAt)
  return `${Math.max(1, Math.round(milliseconds / 1000))} 秒`
}

function formatResultTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp)
}

function resultParameterFields(work: CreatorHistoryItem) {
  const [tier, size] = workResolutionLabel(work).split(' · ')
  const fields: Array<{ label: string; value: string; wide?: boolean }> = [
    { label: '模型', value: work.type === 'video' ? videoModelLabel(work.model) : modelLabel(work.model), wide: true },
    { label: '类型', value: work.provider },
    { label: '画幅', value: work.type === 'image' ? imageAspectRatioLabel(work) : work.aspectRatio || '自动画幅' },
    { label: '清晰度', value: tier },
  ]
  if (size && work.type === 'image') fields.push({ label: '输出尺寸', value: size })
  if (work.type === 'video') {
    fields.push({ label: '镜头数', value: `${work.shotCount || 1} 个` }, { label: '时长', value: `${work.requestedDuration || 0} 秒` })
  }
  fields.push(
    { label: '生成数量', value: `${resultOutputCount(work)} ${work.type === 'image' ? '张' : '段'}` },
    { label: '参考图', value: `${work.referenceCount || 0} 张` },
    ...(work.status === 'pending'
      ? [{ label: '提交时间', value: formatResultTime(work.createdAt) }]
      : [
          { label: '完成耗时', value: formatCompletionDuration(work) },
          { label: '生成时间', value: formatResultTime(work.completedAt || work.updatedAt) },
        ]),
    { label: '输出格式', value: workOutputFormatLabel(work) },
    { label: '来源', value: work.source || '初版作品' },
  )
  return fields.filter((field) => field.value)
}

// Shown while drawing, before real output sizes exist, so the requested size stands in.
function generationTags(work: CreatorHistoryItem) {
  if (work.type === 'video') {
    return metaParts(
      videoModelLabel(work.model),
      work.aspectRatio || '自动画幅',
      videoResolutionTierLabel(work),
      work.requestedDuration ? `${work.requestedDuration} 秒` : undefined,
      (work.shotCount || 1) > 1 ? `${work.shotCount} 个镜头` : undefined,
    )
  }
  const size = workResolutionLabel(work).split(' · ')[1]
  const dimensions = /^(\d+)×(\d+)$/.exec(size || '')
  const tier = work.resolution || (dimensions ? customImageResolution(Number(dimensions[1]), Number(dimensions[2])) : undefined)
  return metaParts(
    modelLabel(work.model),
    imageAspectRatioLabel(work),
    tier,
    size,
    work.outputFormat?.toUpperCase(),
    work.outputFormat === 'gif' && work.frameCount ? `${work.frameCount} 帧` : undefined,
    work.referenceCount ? `${work.referenceCount} 张参考图` : undefined,
  )
}

function videoShotPrompt(shotPrompt: string) {
  return shotPrompt.trim()
}

function formatSequenceDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0))
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, '0')}:${String(safeSeconds % 60).padStart(2, '0')}`
}

function previewResult(output: string, type: StudioMode, index: number) {
  if (type === 'image') {
    openPreview(output)
    return
  }
  const video = document.querySelectorAll<HTMLVideoElement>('.result-segment-video')[index]
  if (!video) return
  const toggle = video.parentElement?.querySelector<HTMLButtonElement>('.video-play-toggle')
  toggle?.click()
}

function addShot() {
  if (videoShots.value.length >= 6) return
  const previous = selectedShot.value
  const shot: VideoShot = {
    id: crypto.randomUUID(),
    prompt: '',
    duration: 8,
    generationMethod: previous?.generationMethod || videoGenerationMethod.value,
    referenceImages: [],
    aspectRatio: previous?.aspectRatio || aspectRatio.value || '16:9',
    followSourceAspect: previous?.followSourceAspect ?? true,
    resolution: previous?.resolution || videoResolution.value,
  }
  videoShots.value.push(shot)
  selectedShotId.value = shot.id
}

function removeShot(index: number) {
  if (videoShots.value.length <= 1) return
  const removed = videoShots.value[index]
  removed?.referenceImages.forEach(reference => URL.revokeObjectURL(reference.url))
  videoShots.value.splice(index, 1)
  if (removed?.id === selectedShotId.value) {
    selectedShotId.value = videoShots.value[Math.min(index, videoShots.value.length - 1)]?.id || videoShots.value[0].id
  }
}

function selectShot(id: string) {
  if (videoShots.value.some(shot => shot.id === id)) selectedShotId.value = id
}

function moveShot(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= videoShots.value.length) return
  const copy = [...videoShots.value]
  ;[copy[index], copy[target]] = [copy[target], copy[index]]
  videoShots.value = copy
}

async function downloadOutput(url: string, work: CreatorHistoryItem, index: number) {
  if (downloadingOutputKey.value) return
  const outputKey = `${work.id}:${index}`
  downloadingOutputKey.value = outputKey
  try {
    await saveOutput(url, work, index, Date.now())
  } catch (error) {
    const message = errorMessage(error, '作品下载失败')
    appStore.showError(/failed to fetch|network error/i.test(message) ? '下载连接失败，请稍后重试' : message)
  } finally {
    if (downloadingOutputKey.value === outputKey) downloadingOutputKey.value = ''
  }
}

async function downloadAllOutputs(work: CreatorHistoryItem) {
  if (downloadingOutputKey.value || !work.outputs.length) return
  const outputKey = `${work.id}:all`
  downloadingOutputKey.value = outputKey
  const timestamp = Date.now()
  let failed = 0
  let lastError: unknown
  try {
    for (const [index, url] of [...work.outputs].entries()) {
      try {
        await saveOutput(url, work, index, timestamp)
      } catch (error) {
        failed += 1
        lastError = error
      }
      // Browsers may drop anchor clicks fired back-to-back.
      if (index < work.outputs.length - 1) await new Promise(resolve => window.setTimeout(resolve, 300))
    }
    if (failed) {
      const message = errorMessage(lastError, '作品下载失败')
      const reason = /failed to fetch|network error/i.test(message) ? '下载连接失败，请稍后重试' : message
      appStore.showError(failed === work.outputs.length ? reason : `${failed} ${work.type === 'image' ? '张图片' : '段视频'}下载失败：${reason}`)
    }
  } finally {
    if (downloadingOutputKey.value === outputKey) downloadingOutputKey.value = ''
  }
}

async function saveOutput(url: string, work: CreatorHistoryItem, index: number, timestamp: number) {
  const extension = work.type === 'video' ? 'mp4' : imageFileExtension(url)
  const filename = `creator-${timestamp}-${index + 1}.${extension}`
  let downloadUrl = url
  let temporaryUrl = ''
  const crossOriginDownload = work.type === 'image' && isCrossOriginHttpURL(url)
  if (work.type === 'video') {
    const cached = work.videoBlobs?.[index]
    let blob: Blob
    if (cached instanceof Blob && cached.size > 0 && (cached.type.startsWith('video/') || cached.type === 'application/octet-stream')) {
      blob = cached
    } else {
      const key = findKeyForWork(work)
      const requestId = (work.requestId || '').split(',').map(id => id.trim()).filter(Boolean)[index]
      blob = await downloadCreatorVideo(url, key?.key, requestId)
      // Repeated clicks reuse the completed read even if the HTTP response
      // was not cacheable. Generation/recovery already persists video blobs.
      const blobs = work.videoBlobs ? [...work.videoBlobs] : []
      blobs[index] = blob
      work.videoBlobs = blobs
    }
    temporaryUrl = URL.createObjectURL(blob)
    downloadUrl = temporaryUrl
  } else if (crossOriginDownload) {
    const key = findKeyForWork(work)
    if (!key) throw new Error('未找到图片对应的可用 Key')
    temporaryUrl = URL.createObjectURL(await loadCreatorImageBlob(key.key, url))
    downloadUrl = temporaryUrl
  } else if (!url.startsWith('blob:') && !url.startsWith('data:')) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`)
    temporaryUrl = URL.createObjectURL(await response.blob())
    downloadUrl = temporaryUrl
  }
  const anchor = document.createElement('a')
  anchor.href = downloadUrl
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  if (temporaryUrl) window.setTimeout(() => URL.revokeObjectURL(temporaryUrl), 1000)
}

function isCrossOriginHttpURL(url: string) {
  if (!/^https?:\/\//i.test(url) || typeof window === 'undefined') return false
  const link = document.createElement('a')
  link.href = url
  return link.origin !== window.location.origin
}

function imageFileExtension(url: string) {
  const dataType = url.match(/^data:image\/(png|jpe?g|webp|gif|avif|svg\+xml)(?:;|,)/i)?.[1]
  const pathType = url.split(/[?#]/, 1)[0].match(/\.(png|jpe?g|webp|gif|avif|svg)$/i)?.[1]
  const type = (dataType || pathType || outputFormat.value || 'png').toLowerCase()
  if (type === 'svg+xml') return 'svg'
  return type === 'jpeg' ? 'jpg' : type
}

function handleVideoPlaybackError(work: CreatorHistoryItem) {
  if (!work.requestId || checkingVideoHistory.value) return
  void refreshVideoWork(work, true)
}

function maskedKey(key: string) {
  if (!key) return '已启用'
  if (key.length <= 10) return `${key.slice(0, 3)}...`
  return `${key.slice(0, 6)}...${key.slice(-4)}`
}

function formatHistoryTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function errorMessage(error: unknown, fallback: string) {
  if (typeof error === 'string' && error.trim()) return error
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error) {
    const candidate = error as { message?: string; error?: { message?: string } }
    return candidate.error?.message || candidate.message || fallback
  }
  return fallback
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.readAsDataURL(file)
  })
}

function delay(milliseconds: number) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds))
}

watch([studioMode, imageCapability, selectedModel, selectedApiKey], loadImagePricing)
watch([studioMode, selectedModel, selectedApiKey], loadVideoPricing)

watch([studioMode, imageCapability, videoCapability], () => {
  if (restoringWorkSettings.value) return
  activeTemplateIndex.value = 0
  promptTemplatePage.value = 0
  selectedWork.value = null
  if (!imageResolutionOptions.value.includes(imageResolution.value)) imageResolution.value = '1K'
  startTemplateAutoplay()
  syncSelectedGroup()
  void loadModels()
})

watch(selectedGroupId, () => {
  if (restoringWorkSettings.value) return
  void loadModels()
})

watch(maxReferenceImages, maximum => {
  while (activeReferenceImages.value.length > maximum) removeReference(activeReferenceImages.value.length - 1)
})

watch(requiresReferenceVideo15, () => {
  if (restoringWorkSettings.value) return
  syncVideoModelForGenerationMethod()
})

watch(maxOutputCount, maximum => {
  if (outputCount.value > maximum) outputCount.value = maximum
})

watch(imageResolutionOptions, options => {
  if (!options.includes(imageResolution.value)) imageResolution.value = options[0]
})

watch(imageResolution, resolution => {
  if (studioMode.value !== 'image' || imageCapability.value !== 'image2') return
  if (resolution === '4K' && !image2StandardModel()) imageResolution.value = '2K'
})

watch(videoResolutionOptions, options => {
  const fallback = options.includes('720p') ? '720p' : options[0]
  if (!options.includes(videoResolution.value)) videoResolution.value = fallback
  videoShots.value.forEach(shot => {
    if (!options.includes(shot.resolution)) shot.resolution = fallback
  })
})

// Keep every shot within the selected relay tier: its duration range, its
// aspect ratios, and no first-frame mode (relays take reference images instead).
watch(selectedVideoRelayTier, tier => {
  if (!tier) return
  const seedance = seedanceVideoTier(selectedModel.value)
  const clamp = (value: number) => snapSeedanceSeconds(tier, value)
  const ratios = tier.aspectRatios || MINIMAX_H3_ASPECT_RATIOS
  const ratio = (value: string) => ratios.includes(value) ? value : '16:9'
  // Relays have no first-frame mode; tiers without uploads fall back to text.
  // Tiers that need references also leave text-to-video.
  const fallback: VideoGenerationMethod = seedance && !seedance.supportsUploadedReferences ? 'text' : 'reference'
  const needsReference = 'requiresReference' in tier && tier.requiresReference
  const method = (value: VideoGenerationMethod) => value === 'image' || (value === 'reference' && fallback === 'text') || (value === 'text' && needsReference) ? fallback : value
  videoDuration.value = clamp(videoDuration.value)
  aspectRatio.value = ratio(aspectRatio.value)
  videoGenerationMethod.value = method(videoGenerationMethod.value)
  videoShots.value.forEach(shot => {
    shot.duration = clamp(shot.duration)
    shot.aspectRatio = ratio(shot.aspectRatio)
    shot.generationMethod = method(shot.generationMethod)
  })
}, { immediate: true })

// Grok has no relay tier; drop ratios it does not accept (e.g. 21:9 carried over from MiniMax).
watch([studioMode, selectedVideoRelayTier], ([mode, tier]) => {
  if (mode !== 'video' || tier) return
  const ratio = (value: string) => GROK_VIDEO_ASPECT_RATIOS.includes(value) ? value : '16:9'
  aspectRatio.value = ratio(aspectRatio.value)
  videoShots.value.forEach(shot => { shot.aspectRatio = ratio(shot.aspectRatio) })
}, { immediate: true })

watch(aspectOptions, options => {
  if (studioMode.value === 'image' && imageCapability.value === 'image2' && imageSizeMode.value !== 'ratio') return
  if (!options.some(option => option.value === aspectRatio.value)) {
    aspectRatio.value = options[0]?.value || '1:1'
  }
})

watch(selectedModel, model => {
  if (studioMode.value !== 'image' || imageCapability.value !== 'image2' || !model) return
  if (isImage2FourKModel(model)) {
    selectedModel.value = image2StandardModel() || ''
  }
})

function stopToolbarStuckTracking() {
  document.removeEventListener('scroll', scheduleToolbarStuck, { capture: true })
  window.removeEventListener('resize', scheduleToolbarStuck)
  if (toolbarStuckFrame) cancelAnimationFrame(toolbarStuckFrame)
  toolbarStuckFrame = 0
  stopSettingsReveal()
}

function activateStudio() {
  studioActive = true
  window.addEventListener('paste', handlePaste)
  window.addEventListener('keydown', handlePreviewKeydown)
  // Capture so scrolls of any ancestor container are seen, not only the window.
  document.addEventListener('scroll', scheduleToolbarStuck, { capture: true, passive: true })
  window.addEventListener('resize', scheduleToolbarStuck)
  scheduleToolbarStuck()
  startTemplateAutoplay()
  generationClock.value = Date.now()
}

onActivated(() => {
  activateStudio()
  if (unsubscribeHistory) void syncHistory()
})
onDeactivated(() => {
  studioActive = false
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('keydown', handlePreviewKeydown)
  stopToolbarStuckTracking()
  stopTemplateAutoplay()
  imageSizeDialogOpen.value = false
  videoParamsDialogOpen.value = false
  historyDrawerOpen.value = false
  previewUrl.value = ''
  studioElement.value?.querySelectorAll<HTMLVideoElement>('video').forEach(video => video.pause())
})

onMounted(() => {
  unsubscribeHistory = creatorHistory.subscribe(applyHistoryUpdate)
  unsubscribeExternalHistory = creatorHistory.subscribeExternal(applyExternalHistoryChange)
  window.addEventListener('focus', syncVisibleHistory)
  document.addEventListener('visibilitychange', syncVisibleHistory)
  activateStudio()
  void refreshStudio()
})

onBeforeUnmount(() => {
  unsubscribeHistory?.()
  unsubscribeExternalHistory?.()
  window.removeEventListener('focus', syncVisibleHistory)
  document.removeEventListener('visibilitychange', syncVisibleHistory)
  imagePricingRequest?.abort()
  videoPricingRequest?.abort()
  disposed = true
  window.removeEventListener('paste', handlePaste)
  window.removeEventListener('keydown', handlePreviewKeydown)
  stopToolbarStuckTracking()
  if (generationTimer !== undefined) window.clearInterval(generationTimer)
  stopTemplateAutoplay()
  const referenceUrls = [
    ...referenceImages.value,
    ...videoShots.value.flatMap(shot => shot.referenceImages),
  ].map(reference => reference.url)
  new Set(referenceUrls).forEach(url => URL.revokeObjectURL(url))
  transientObjectUrls.forEach(url => URL.revokeObjectURL(url))
})
</script>

<style scoped>
.local-save-warning { margin: 0; padding: 12px 20px; color: var(--creator-image-text, #8a601a); background: var(--creator-image-background, #fff8e8); font-size: 13px; }
/* Dialogs teleport to <body>, so they need their own copy of the design tokens. */
.creator-studio,
:global(.creator-dialog) {
  --creator-accent: #0f9f8f;
  --creator-accent-strong: #087f74;
  --creator-accent-soft: #e8faf6;
  --creator-line: #dfe8e7;
  --creator-muted: #738096;
  --creator-radius: 12px;
  --creator-radius-small: 8px;
  --creator-surface-radius: 16px;
  --creator-radius-large: var(--creator-surface-radius);
}

.creator-studio {
  --creator-workspace-gutter: 2rem;
  --creator-workspace-width: calc(100% - 4rem);
  position: relative;
  display: flex;
  height: calc(100vh - 8rem);
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border-radius: var(--creator-surface-radius);
  color: #142033;
}

.studio-toolbar {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) auto minmax(150px, 1fr);
  align-items: center;
  min-height: 66px;
  padding: 8px 14px 8px 22px;
  border-bottom: 1px solid var(--creator-line);
  background: rgb(255 255 255 / 96%);
}

.studio-title,
.studio-title-icon,
.toolbar-actions,
.mode-option,
.settings-heading,
.history-heading,
.field-row,
.key-needed-title,
.key-ready,
  .prompt-tool,
  .stepper,
  .toggle-row,
  .result-heading,
.result-actions,
.quick-templates {
  display: flex;
  align-items: center;
}

.studio-title { gap: 10px; font-size: 16px; font-weight: 700; }
.studio-title-icon { justify-content: center; width: 30px; height: 30px; color: var(--creator-accent-strong); background: var(--creator-accent-soft); border-radius: var(--creator-radius-small); }

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  width: 410px;
  padding: 4px;
  border: 1px solid #cddbd9;
  border-radius: var(--creator-radius-large);
  background: #edf4f3;
  box-shadow: 0 3px 10px rgb(29 82 75 / 6%);
}

.mode-option {
  justify-content: center;
  gap: 8px;
  min-height: 40px;
  border: 1px solid transparent;
  border-radius: var(--creator-radius);
  color: #718096;
  font-size: 13px;
  font-weight: 650;
  transition: 160ms ease;
}

.mode-option-icon {
  display: inline-grid;
  flex: 0 0 30px;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 1px solid #d2dfde;
  border-radius: var(--creator-radius-small);
  color: #72859a;
  background: #f8fbfb;
  transition: 160ms ease;
}
.mode-option-copy { display: grid; min-height: 30px; align-content: center; text-align: left; line-height: 1.05; }
.mode-option-copy strong { font-size: 12px; font-weight: 750; }
.mode-option small { margin-bottom: 4px; color: #9aa8bb; font-size: 8px; font-weight: 800; letter-spacing: 0; }
.mode-option.active { border-color: #e2e9e8; background: #fff; color: var(--creator-accent-strong); box-shadow: 0 3px 12px rgb(29 82 75 / 10%); }
.mode-option.active small { color: #6e9e99; }
.mode-option-image.active .mode-option-icon { border-color: #a7e3d9; color: var(--creator-accent-strong); background: #effbf8; }
.mode-option-video.active { color: #175cd3; }
.mode-option-video.active small { color: #809ac7; }
.mode-option-video.active .mode-option-icon { border-color: #b9d3ff; color: #2563eb; background: #eff6ff; }

.toolbar-actions { justify-content: flex-end; gap: 8px; }
.new-creation-link { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid #9cd9cf; border-radius: var(--creator-radius); background: #effbf8; color: var(--creator-accent-strong); font-size: 12px; font-weight: 700; white-space: nowrap; }
.new-creation-link:hover { background: #dcf7ef; border-color: var(--creator-accent); }
.new-creation-link:focus-visible { outline: 2px solid var(--creator-accent); outline-offset: 3px; }
.history-tab-generating { display: inline-flex; align-items: center; gap: 4px; margin-left: 2px; padding: 1px 6px; border-radius: 999px; color: var(--creator-accent-strong); background: var(--creator-accent-soft); font-size: 11px; }
.history-tab-generating .button-spinner { width: 10px; height: 10px; border-width: 1.5px; border-color: #c6e8df; border-top-color: var(--creator-accent); }
/* Running work: one static glyph inside a rotating arc, over a soft shimmer. */
.history-generating { position: absolute; inset: 0; display: grid; place-items: center; background: linear-gradient(110deg, #e8f3f1 30%, #f4fbfa 50%, #e8f3f1 70%) 0 0 / 220% 100%; animation: creatorShimmer 1.8s ease-in-out infinite; }
.history-generating.has-preview { background: rgb(255 255 255 / 45%); backdrop-filter: blur(1.5px); animation: none; }
.history-generating-ring { position: relative; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; color: var(--creator-accent-strong); background: #fff; box-shadow: 0 2px 6px rgb(24 138 121 / 14%); }
.history-generating-ring::before { position: absolute; inset: -3px; border: 2px solid #d3eee9; border-top-color: var(--creator-accent); border-radius: 50%; content: ''; animation: creatorSpin .9s linear infinite; }
@media (prefers-reduced-motion: reduce) { .history-generating, .history-generating-ring::before { animation-duration: 3s; } }
.history-item.generating { border-color: #a5ddd4; }
.history-copy small.history-progress { color: var(--creator-accent-strong); }
.pending-image-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.generation-new-creation { flex: none; min-height: 36px; gap: 6px; padding: 0 14px; border-color: #e3ebe9; border-radius: var(--creator-radius); background: #fff; color: #475569; font-size: 13px; font-weight: 600; box-shadow: 0 1px 2px rgb(16 40 36 / 5%); transition: background 150ms ease, border-color 150ms ease, color 150ms ease; }
.generation-new-creation:hover { border-color: var(--creator-accent); background: #effbf8; color: var(--creator-accent-strong); }
.ready-status {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  padding: 0 13px;
  border: 1px solid #86e7b8;
  border-radius: 999px;
  color: #07835f;
  background: #effcf6;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}
.ready-status i { width: 7px; height: 7px; border-radius: 50%; background: currentColor; box-shadow: 0 0 0 4px rgb(7 131 95 / 8%); }
.connection-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: var(--creator-radius);
  color: #455468;
  background: transparent;
  transition: color 150ms ease, background 150ms ease, box-shadow 150ms ease;
}
.connection-action:hover { color: var(--creator-accent-strong); background: #edf9f7; box-shadow: inset 0 0 0 1px #cce8e3; }
.connection-action:disabled { cursor: wait; opacity: .55; }
.connection-action .pulsing { animation: creatorStatusPulse 900ms ease-in-out infinite alternate; }
.icon-action,
  .collapse-action,
  .history-reopen,
  .brief-topline button,
  .reference-item button,
.preview-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: 1px solid #dbe5e4;
  border-radius: var(--creator-radius);
  color: #536176;
  background: #fff;
  transition: 150ms ease;
}
.icon-action:hover,
.collapse-action:hover,
.brief-topline button:hover { border-color: #8fded2; color: var(--creator-accent-strong); background: #f4fcfa; }
.icon-action:disabled { cursor: wait; opacity: .55; }
.icon-action.danger:hover { border-color: #f0b5b5; color: #c84040; background: #fff6f6; }

.studio-grid {
  position: relative;
  display: grid;
  grid-template-columns: clamp(17rem, 19vw, 20rem) minmax(0, 1fr) clamp(22rem, 23vw, 26rem);
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  background: #f3f8f7;
}
.studio-grid.history-collapsed { grid-template-columns: minmax(0, 1fr) clamp(22rem, 23vw, 26rem); }
.history-panel,
.settings-panel { min-width: 0; height: 100%; background: #fff; }
.history-panel { display: flex; min-height: 0; flex-direction: column; overflow: hidden; border-right: 1px solid var(--creator-line); }
.history-collapsed .history-panel:not(.is-drawer) { display: none; }
/* Compact-width history entry; shown by the 1120px breakpoint. */
/* Same look as the desktop "历史记录" reopen button. */
.history-drawer-toggle { position: relative; display: none; flex-shrink: 0; align-items: center; justify-content: center; }
.history-drawer-toggle:focus-visible { outline: 2px solid var(--creator-accent); outline-offset: 2px; }
.history-drawer-toggle-live { position: absolute; top: -3px; right: -3px; width: 9px; height: 9px; border: 2px solid #fff; border-radius: 50%; background: var(--creator-accent); animation: creatorStatusPulse 900ms ease-in-out infinite alternate; }
.history-drawer-handle { display: none; }
.history-drawer-backdrop { position: fixed; z-index: 49; inset: 0; background: rgb(15 23 42 / 42%); opacity: 0; pointer-events: none; transition: opacity 200ms ease; }
.history-drawer-backdrop.open { opacity: 1; pointer-events: auto; }
/* Fixed, not teleported: no ancestor sets a transform or filter, so it escapes the studio card. */
.history-panel.is-drawer {
  position: fixed;
  z-index: 50;
  top: 0;
  bottom: 0;
  left: 0;
  width: min(360px, 86vw);
  height: auto;
  color: #142033;
  box-shadow: 0 20px 60px rgb(15 23 42 / 24%);
  transform: translateX(-100%);
  visibility: hidden;
  transition: transform 240ms cubic-bezier(.2, .8, .2, 1), visibility 0s linear 240ms;
}
.history-panel.is-drawer.open { transform: none; visibility: visible; transition: transform 240ms cubic-bezier(.2, .8, .2, 1); }
.history-panel.is-drawer.dragging { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .history-panel.is-drawer,
  .history-panel.is-drawer.open,
  .history-drawer-backdrop { transition: none; }
  .history-drawer-toggle-live { animation: none; }
}
/* Both history entries: one flat surface, the same height as the mode switch. */
.playground-history-reopen-button,
.history-drawer-toggle {
  width: auto;
  height: auto;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid #d7e4e2;
  border-radius: var(--creator-radius-large);
  color: #415066;
  background: #fff;
  box-shadow: 0 1px 2px rgb(29 82 75 / 5%);
  white-space: nowrap;
  transition: border-color 160ms ease, box-shadow 160ms ease, color 160ms ease;
}
.history-entry-surface {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 100%;
  min-height: 48px;
  padding: 0 16px 0 8px;
}
.history-entry-icon {
  position: relative;
  display: inline-grid;
  flex: 0 0 32px;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: var(--creator-radius-small);
  color: var(--creator-accent-strong);
  background: var(--creator-accent-soft);
  transition: 160ms ease;
}
.history-entry-copy { display: grid; align-content: center; text-align: left; line-height: 1.1; }
.history-entry-copy small { margin-bottom: 3px; color: #9aa8bb; font-size: 8px; font-weight: 800; letter-spacing: .06em; }
.history-entry-copy strong { font-size: 13px; font-weight: 700; }
.history-drawer-toggle[aria-expanded="true"] { border-color: #a7e3d9; color: var(--creator-accent-strong); background: #fff; box-shadow: 0 4px 14px rgb(29 82 75 / 10%); }
.history-drawer-toggle[aria-expanded="true"] small { color: #6e9e99; }
/* Hover effects on the history entries are temporarily disabled. */
.playground-history-reopen-button:focus-visible { outline: 2px solid var(--creator-accent); outline-offset: 2px; }

.history-heading { gap: 10px; padding: 22px 18px 14px; }
.history-heading > div:first-child { min-width: 0; flex: 1; }
.history-heading h2,
.settings-heading h2 { margin: 0; color: #172033; font-size: 16px; font-weight: 750; }
.settings-heading p { margin: 3px 0 0; color: var(--creator-muted); font-size: 12px; }
.history-count { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: var(--creator-radius-small); color: #8794a8; background: #f1f5f8; font-size: 12px; font-weight: 700; }
.collapse-action { width: 34px; }
.history-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin: 0 16px 14px; padding: 4px; border: 1px solid var(--creator-line); border-radius: var(--creator-radius-large); background: #f2f7f6; }
.history-tabs button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; border-radius: var(--creator-radius); color: #8090a6; font-size: 12px; font-weight: 650; }
.history-tabs button.active { color: var(--creator-accent-strong); background: #fff; box-shadow: 0 2px 8px rgb(30 72 67 / 8%); }

.history-list { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 0 12px 18px; scrollbar-color: #c5cbd1 transparent; scrollbar-width: thin; }
.history-list::-webkit-scrollbar { width: 8px; }
.history-list::-webkit-scrollbar-track { background: transparent; }
.history-list::-webkit-scrollbar-thumb { border: 2px solid #fff; border-radius: 999px; background: #c5cbd1; }
.history-list::-webkit-scrollbar-thumb:hover { background: #9ba4ad; }
.history-item { --history-item-bg: #fff; position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr) 28px; align-items: center; gap: 10px; width: 100%; height: 70px; margin-bottom: 8px; padding: 8px; overflow: hidden; border: 1px solid #dce6e4; border-radius: var(--creator-radius); text-align: left; background: #fff; box-shadow: 0 2px 8px rgb(29 61 57 / 4%); }
.history-item:hover { --history-item-bg: #f7fcfb; border-color: #a5ddd4; background: #f7fcfb; box-shadow: 0 6px 16px rgb(29 81 73 / 8%); }
.history-item.active { --history-item-bg: #eefbf8; border-color: #6fddcc; background: #eefbf8; box-shadow: 0 5px 14px rgb(24 138 121 / 8%); }
.history-item-hitbox { position: absolute; z-index: 1; inset: 0; border-radius: inherit; }
.history-item-hitbox:focus-visible { outline: 2px solid #39b9a5; outline-offset: -3px; }
.history-preview { position: relative; display: grid; place-items: center; width: 52px; height: 52px; overflow: hidden; border-radius: var(--creator-radius-small); color: #8da09e; background: #e8f0ef; }
.history-preview img,
.history-preview video { width: 100%; height: 100%; object-fit: cover; }
.history-status { position: absolute; right: 4px; bottom: 4px; width: 8px; height: 8px; border: 2px solid #fff; border-radius: 50%; }
.history-status.pending { background: #f0a63a; }
.history-status.failed { background: #d84b4b; }
.history-copy { min-width: 0; align-self: center; }
.history-copy strong,
.history-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-copy strong { color: #344054; font-size: 12px; font-weight: 700; }
.history-copy small { margin-top: 5px; color: #95a1b2; font-size: 10px; }
.history-preview,
.history-copy { pointer-events: none; }
/* Delete sits in its own grid column, so the title truncates before it instead of hiding under it.
   The column is reserved even while the button is hidden, so hovering never reflows the text. */
.history-item-actions { position: relative; z-index: 2; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 160ms ease; }
/* Only keyboard focus on delete should reveal it after the pointer leaves the card. */
.history-item:hover .history-item-actions,
.history-item-actions:has(> .history-delete:focus-visible) { opacity: 1; pointer-events: auto; }
.history-item-actions .history-delete { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 50%; color: #8295a4; }
.history-item-actions .history-delete:hover { color: #cc5252; background: #fff1f1; }
.history-item-actions .history-delete:disabled { cursor: not-allowed; opacity: .4; }
.history-empty { display: grid; justify-items: center; padding: 90px 22px 30px; text-align: center; color: #92a0b3; }
.history-empty > span { display: grid; place-items: center; width: 58px; height: 58px; margin-bottom: 14px; border-radius: var(--creator-radius); background: #f3f7f7; }
.history-empty strong { color: #58667a; font-size: 14px; }
.history-empty p { margin: 7px 0 0; font-size: 12px; }

.canvas-panel {
  position: relative;
  container-type: inline-size;
  display: flex;
  min-width: 0;
  min-height: 0;
  height: 100%;
  flex: 1 1 auto;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-color: #c5cbd1 transparent;
  scrollbar-width: thin;
}
.canvas-panel::-webkit-scrollbar { width: 9px; }
.canvas-panel::-webkit-scrollbar-track { background: transparent; }
.canvas-panel::-webkit-scrollbar-thumb { border: 2px solid #f3f8f7; border-radius: 999px; background: #c5cbd1; }
.canvas-panel::-webkit-scrollbar-thumb:hover { background: #9ba4ad; }
.canvas-panel > .result-workspace,
.canvas-panel > .professional-workspace { flex: 0 0 auto; }
.inspiration-workspace,
.generation-state,
.result-workspace,
.professional-workspace {
  width: var(--creator-workspace-width);
  margin-block: auto;
  margin-inline: var(--creator-workspace-gutter);
}
.result-workspace {
  /* Historical results should start at the top of the scrollable canvas. */
  margin-block: 0;
}
.inspiration-workspace { max-width: 58rem; margin-inline: auto; padding: 46px 0 24px; }
.inspiration-intro { text-align: center; }
.inspiration-mark { display: inline-grid; place-items: center; width: 68px; height: 68px; border: 1px solid #79e3d2; border-radius: var(--creator-radius); color: var(--creator-accent-strong); background: #e8fbf7; }
.eyebrow { margin: 18px 0 10px; color: var(--creator-accent-strong); font-size: 10px; font-weight: 850; letter-spacing: 0; }
.inspiration-intro h2,
.generation-state h2,
.result-heading h2 { margin: 0; color: #172033; font-size: 23px; font-weight: 780; }
.inspiration-intro > p:last-child { margin: 10px auto 0; color: #7a8799; font-size: 13px; line-height: 1.7; }

.featured-brief { margin-top: 22px; overflow: hidden; border: 1px solid #263c39; border-radius: var(--creator-radius-large); color: #eaf1ef; background: #101d1b; box-shadow: 0 24px 48px rgb(20 45 41 / 18%); }
.brief-topline { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 12px; min-height: 60px; margin: 0 24px; border-bottom: 1px solid #2b3e3b; color: #9db3af; font-size: 11px; font-weight: 700; }
.brief-topline > span:first-child { display: flex; align-items: center; gap: 6px; color: #b5d8d1; }
.brief-topline > div { display: flex; gap: 7px; }
.brief-topline button { width: 32px; height: 32px; border-color: #334b47; color: #b9cbc7; background: #182825; }
.brief-stage { height: 256px; overflow: hidden; }
.brief-body { display: grid; grid-template-columns: minmax(0, .88fr) minmax(0, 1.12fr); height: 100%; min-height: 0; padding: 24px; }
.brief-summary { display: flex; flex-direction: column; align-items: flex-start; min-height: 0; padding-right: 24px; border-right: 1px solid #33423f; }
.brief-summary > span { display: inline-flex; padding: 5px 9px; border: 1px solid #9a7744; border-radius: var(--creator-radius-small); color: #d6b374; background: #28251e; font-size: 10px; }
.brief-summary h3 { margin: 16px 0 7px; color: #fff; font-size: 28px; font-weight: 760; }
.brief-summary p { margin: 0; color: #a7b6b3; font-size: 12px; line-height: 1.7; }
.brief-summary small { display: block; margin-top: auto; padding-top: 16px; color: #788b87; font-size: 10px; }
.brief-copy { display: flex; align-items: flex-start; flex-direction: column; min-width: 0; min-height: 0; padding-left: 24px; }
.brief-copy > small { flex-shrink: 0; color: #c2d3cf; font-size: 10px; font-weight: 800; letter-spacing: 0; }
.brief-copy p { flex: 1; align-self: stretch; min-height: 0; overflow-y: auto; overflow-wrap: anywhere; scrollbar-width: thin; scrollbar-color: #5c716d transparent; margin: 14px 0; color: #d2dedb; font-size: 13px; line-height: 1.8; }
.brief-copy button { display: inline-flex; flex-shrink: 0; align-items: center; gap: 7px; min-height: 40px; padding: 0 14px; border-radius: var(--creator-radius); color: #2f2b20; background: #dfba69; font-size: 12px; font-weight: 750; }
.brief-copy button:hover { background: #edcc82; }
.brief-slide-enter-active,
.brief-slide-leave-active { transition: opacity 220ms ease, transform 220ms ease; }
.brief-slide-enter-from { opacity: 0; transform: translateX(12px); }
.brief-slide-leave-to { opacity: 0; transform: translateX(-12px); }
@media (prefers-reduced-motion: reduce) { .brief-stage { transition: none; } }
.brief-navigation { display: flex; align-items: center; gap: 16px; min-height: 58px; padding: 12px 24px; border-top: 1px solid #263a36; background: rgb(255 255 255 / 2%); }
.brief-navigation > label { flex-shrink: 0; color: #9bb0aa; font-size: 11px; }
.brief-range { appearance: none; flex: 1; min-width: 0; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
.brief-range::-webkit-slider-runnable-track { height: 3px; border-radius: 3px; background: linear-gradient(to right, #dfba69 var(--brief-progress), #3b514c var(--brief-progress)); }
.brief-range::-moz-range-track { height: 3px; border-radius: 3px; background: linear-gradient(to right, #dfba69 var(--brief-progress), #3b514c var(--brief-progress)); }
.brief-range::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; margin-top: -4.5px; border: 2px solid #101d1b; border-radius: 50%; background: #dfba69; box-shadow: 0 0 0 1px rgb(223 186 105 / 35%); transition: box-shadow 150ms ease; }
.brief-range::-moz-range-thumb { width: 8px; height: 8px; border: 2px solid #101d1b; border-radius: 50%; background: #dfba69; box-shadow: 0 0 0 1px rgb(223 186 105 / 35%); }
.brief-range:hover::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgb(223 186 105 / 14%); }
.brief-range:focus-visible { outline: 2px solid #dfba69; outline-offset: 4px; }
.brief-position { display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px; min-width: 64px; justify-content: center; padding: 5px 8px; border: 1px solid #354a44; border-radius: var(--creator-radius); background: #192b25; font-size: 11px; font-variant-numeric: tabular-nums; }
.brief-position strong { color: #dfba69; font-weight: 650; }
.brief-position > span { color: #91a59e; }
.quick-templates { display: grid; gap: 10px; margin-top: 22px; }
.quick-templates-list { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
/* Section label with a hairline rule, so the chips read as a group rather than a form. */
.quick-templates-label { display: flex; align-items: center; gap: 12px; color: #7d8b9c; font-size: 11px; font-weight: 700; letter-spacing: .08em; }
.quick-templates-label::after { content: ''; flex: 1; height: 1px; background: #e1eae8; }
.quick-templates button { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; padding: 10px 12px; border: 1px solid #d7e5e2; border-radius: var(--creator-radius); background: #fff; text-align: left; transition: border-color 160ms ease, background 160ms ease, transform 160ms ease; }
.quick-templates button > span { display: grid; gap: 3px; min-width: 0; }
.quick-templates button strong { overflow: hidden; color: #2f4642; font-size: 12px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.quick-templates button small { overflow: hidden; color: #94a3a0; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.quick-templates button > svg { flex-shrink: 0; color: var(--creator-accent); opacity: 0; transform: translateX(-4px); transition: opacity 160ms ease, transform 160ms ease; }
.quick-templates button:hover,
.quick-templates button:focus-visible { border-color: #93d9ce; background: #f6fcfb; transform: translateY(-1px); }
.quick-templates button:hover strong,
.quick-templates button:focus-visible strong { color: var(--creator-accent-strong); }
.quick-templates button:hover > svg,
.quick-templates button:focus-visible > svg { opacity: 1; transform: none; }
@media (hover: none) { .quick-templates button > svg { opacity: .6; transform: none; } }
@media (prefers-reduced-motion: reduce) { .quick-templates button, .quick-templates button > svg { transition: none; transform: none; } }

/* Images and videos share fixed outer gutters, including when history is collapsed. */
.generation-state { --generation-row-width: calc(100cqi - 2 * var(--creator-workspace-gutter)); --generation-frame-height: clamp(220px, calc(100vh - 360px), 760px); position: relative; display: grid; flex: 0 0 auto; grid-template-columns: minmax(0, 1fr); justify-items: center; row-gap: 20px; margin-block: 0; padding-block: var(--creator-workspace-gutter); text-align: center; isolation: isolate; }
.generation-state.is-video { flex: 1 0 0; grid-template-rows: auto minmax(220px, 1fr); }
/* One compact status panel; the frames below carry the main loading animation. */
.generation-panel { display: grid; gap: 18px; width: 100%; min-width: 0; padding: 22px 24px 20px; border: 1px solid #e6eeec; border-radius: var(--creator-radius-large); background: #fff; box-shadow: 0 1px 2px rgb(16 40 36 / 4%), 0 14px 36px -14px rgb(16 40 36 / 12%); text-align: left; }
.generation-heading { display: flex; align-items: center; gap: 14px; min-width: 0; }
.generation-heading-copy { display: grid; flex: 0 1 auto; order: 1; gap: 2px; min-width: 0; }
.generation-heading .generation-new-creation { order: 3; margin-left: auto; }
/* The ellipsis needs overflow: hidden; the offset padding gives the status dot's pulse room so it isn't clipped. */
.generation-state .generation-heading-copy h2 { margin-left: -8px; padding-left: 8px; overflow: hidden; color: #0f172a; font-size: 16px; font-weight: 650; letter-spacing: -.01em; line-height: 1.4; text-overflow: ellipsis; white-space: nowrap; }
/* A breathing dot marks the task as live without a heavy icon tile. */
.generation-status-dot { display: inline-block; width: 8px; height: 8px; margin-right: 10px; border-radius: 50%; background: var(--creator-accent); vertical-align: 2px; animation: creatorStatusPulse 1.8s ease-out infinite; }
@media (prefers-reduced-motion: reduce) { .generation-status-dot { animation: none; } }
.generation-body { display: grid; gap: 16px; }
.generation-brief { display: grid; gap: 12px; min-width: 0; }
.generation-prompt { display: -webkit-box; margin: 0; overflow: hidden; color: #1e293b; font-size: 14px; line-height: 1.75; overflow-wrap: anywhere; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.result-tags.generation-tags { align-items: center; }
.result-tags.generation-tags li { padding: 2px 10px; border: 1px solid #e6edeb; color: #5c6b7a; background: #f8fafa; font-size: 11px; font-weight: 500; line-height: 16px; letter-spacing: .01em; font-variant-numeric: tabular-nums; }
.result-tags.generation-tags li:first-child { border-color: #cfe9e3; color: var(--creator-accent-strong); background: #f3faf8; }
.generation-heading-copy p { margin: 0; overflow: hidden; color: #8391a2; font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.generation-stage { display: flex; align-items: center; justify-content: center; gap: 12px; max-width: 100%; }
.generation-stage.is-image { display: grid; width: 100%; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 12px; }
.generation-stage.is-image .generation-frame { width: 100%; }
/* A single portrait placeholder should follow the requested ratio instead of filling the whole canvas width. */
.generation-stage.is-image:has(> .generation-frame:only-child) { display: flex; }
.generation-stage.is-image:has(> .generation-frame:only-child) > .generation-frame {
  /* Preserve a single image's ratio and portrait height limit within the full-width stage. */
  width: var(--generation-frame-width);
  height: auto;
  max-width: 100%;
  justify-self: center;
}
.generation-stage.is-video { display: grid; width: 100%; grid-template-columns: repeat(var(--generation-columns, 1), minmax(0, 1fr)); grid-auto-rows: minmax(140px, 1fr); align-items: stretch; margin-bottom: 0; }
.generation-stage.is-video > .generation-frame { width: 100%; min-height: 0; }
.generation-frame { position: relative; display: grid; flex: 0 1 auto; container-type: inline-size; width: var(--generation-frame-width); min-width: 0; place-items: center; overflow: hidden; border: 1px solid #cfeee8; border-radius: var(--creator-radius-large); background: linear-gradient(110deg, #ecf8f6 30%, #f8fdfc 50%, #ecf8f6 70%) 0 0 / 220% 100%; box-shadow: 0 14px 34px rgb(24 104 93 / 10%), inset 0 0 0 4px rgb(255 255 255 / 55%); }
.generation-frame.is-current { border-color: #bfe9e1; background: #f3f9f8; box-shadow: 0 20px 50px rgb(24 104 93 / 10%), inset 0 0 0 1px rgb(255 255 255 / 70%); }
.generation-frame.is-queued { border-style: dashed; background: rgb(255 255 255 / 55%); box-shadow: none; }
.generation-frame.is-done { border-color: #a5ddd4; animation: creatorFrameIn .45s ease-out; }
.generation-frame > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.generation-frame-video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
/* Scale with the frame so narrow mobile frames keep the spinner proportional. */
.generation-frame-dots { position: absolute; inset: 0; border-radius: inherit; background-image: radial-gradient(rgb(15 159 143 / 9%) 1px, transparent 1.2px); background-size: 18px 18px; pointer-events: none; }
.generation-frame-loader { position: relative; z-index: 1; display: grid; justify-items: center; gap: 14px; }
.generation-frame-ring { position: relative; display: grid; place-items: center; width: clamp(28px, min(calc(34px + 4cqi), calc(var(--generation-frame-height-ring-size) - 6px)), 76px); height: clamp(28px, min(calc(34px + 4cqi), calc(var(--generation-frame-height-ring-size) - 6px)), 76px); border-radius: 50%; color: var(--creator-accent-strong); background: rgb(255 255 255 / 82%); box-shadow: 0 6px 20px rgb(24 138 121 / 16%), inset 0 0 0 1px rgb(255 255 255 / 90%); backdrop-filter: blur(10px); }
.generation-frame-ring > svg { width: 42%; height: 42%; animation: creatorTwinkle 2.4s ease-in-out infinite; }
.generation-frame-ring::before { position: absolute; inset: -3px; border-radius: 50%; background: conic-gradient(from 0deg, transparent 0 55%, rgb(43 196 172 / 35%) 75%, var(--creator-accent-strong) 100%); content: ''; -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); mask: radial-gradient(farthest-side, transparent calc(100% - 2.5px), #000 calc(100% - 2px)); animation: creatorSpin 1.4s linear infinite; }
@media (prefers-reduced-motion: reduce) { .generation-frame-ring > svg, .generation-frame-ring::before { animation: none; } }
.generation-done-count { flex: none; color: #8391a2; font-size: 12px; font-style: normal; font-weight: 500; line-height: 18px; font-variant-numeric: tabular-nums; }
.generation-frame-index { color: #a7bbb7; font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
.generation-frame.is-failed { border-style: dashed; border-color: #ecc9c4; background: #fff6f5; box-shadow: none; }
.generation-frame-failed { display: grid; justify-items: center; gap: 4px; color: #c0574d; font-size: 11px; font-weight: 600; }
.generation-frame-open { position: absolute; z-index: 1; inset: 0; border-radius: inherit; cursor: zoom-in; }
.generation-frame-open:focus-visible { outline: 2px solid var(--creator-accent); outline-offset: -3px; }
.generation-frame-actions { position: absolute; z-index: 2; top: 8px; right: 8px; display: flex; gap: 6px; opacity: 0; transition: opacity 150ms ease; }
.generation-frame:hover .generation-frame-actions, .generation-frame-actions:focus-within { opacity: 1; }
/* Neutral glass, so the buttons read on any image without tinting it. */
.generation-frame-action { display: grid; place-items: center; width: 30px; height: 30px; border: 1px solid rgb(255 255 255 / 18%); border-radius: 50%; color: #fff; background: rgb(15 23 42 / 52%); box-shadow: 0 2px 8px rgb(0 0 0 / 22%); backdrop-filter: blur(6px); transition: background 150ms ease; }
.generation-frame-action:not(:disabled):hover { background: rgb(15 23 42 / 76%); }
.generation-frame-action > svg { width: 16px; height: 16px; }
.generation-frame-action:disabled { cursor: wait; opacity: .5; }
/* Touch screens have no hover, so finished frames always show their actions. */
@media (hover: none) { .generation-frame-actions { opacity: 1; } }
/* Narrow frames (several per row on phones) stay clean: a tap opens the preview, which has save and edit. */
@container (max-width: 160px) {
  .generation-frame-actions { display: none; }
}
.generation-metrics { display: flex; align-items: center; gap: 16px; min-height: 20px; margin: 0; }
.generation-metrics > .progress-track { flex: 1 1 auto; height: 3px; }
.generation-segments { display: flex; flex: 1 1 auto; gap: 6px; min-width: 0; }
.generation-segment { position: relative; flex: 1 1 0; height: 4px; overflow: hidden; border-radius: 999px; background: #e3f4f1; transition: background .4s ease; }
.generation-segment.is-done { background: linear-gradient(90deg, #2bc4ac, var(--creator-accent-strong)); }
.generation-segment.is-failed { background: #f3cdc8; }
.generation-segment.is-current::after { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, rgb(43 196 172 / 80%), transparent); content: ''; transform: translateX(-100%); animation: creatorSegmentSweep 1.8s ease-in-out var(--segment-delay, 0s) infinite; }
@media (prefers-reduced-motion: reduce) { .generation-segment.is-current { background: #bfe7df; } .generation-segment.is-current::after { display: none; } }
.generation-elapsed { display: inline-flex; flex: none; align-items: center; gap: 5px; white-space: nowrap; color: #8391a2; font-size: 12px; line-height: 1; }
.generation-elapsed strong { margin-left: 2px; color: #0f172a; font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums; }
.generation-percent { display: inline-flex; flex: none; align-items: center; justify-content: center; min-width: 42px; height: 22px; padding: 0 8px; border-radius: 999px; color: var(--creator-accent-strong); background: #d8f8f1; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
.progress-track { width: 100%; height: 4px; margin: 0; overflow: hidden; border-radius: 999px; background: #e3f4f1; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #2bc4ac, var(--creator-accent-strong)); transition: width .6s ease; }
/* 双段伸缩：长段、短段轮流从左端伸出、边走边伸缩、在右端收尾，同一时刻只有一段，前一段走完才从起点再出；位置和长度都按轨道百分比，宽度自适应；用 clip-path 裁出段落，不改 left/right，避免逐帧重排 */
.progress-track.indeterminate span { position: relative; width: 100%; background: none; transition: none; }
.progress-track.indeterminate span::before, .progress-track.indeterminate span::after { content: ''; position: absolute; inset: 0; border-radius: inherit; background: linear-gradient(90deg, #2bc4ac, var(--creator-accent-strong)); clip-path: inset(0 100% 0 0 round 999px); animation: creatorProgressLong 2.2s linear infinite; }
.progress-track.indeterminate span::after { animation-name: creatorProgressShort; }
@media (prefers-reduced-motion: reduce) { .progress-track.indeterminate span::before { clip-path: none; opacity: .6; animation: none; } .progress-track.indeterminate span::after { display: none; } }
@media (prefers-reduced-motion: reduce) { .generation-frame.is-current, .generation-frame.is-done { animation: none; } }
/* Keep a four-image generation balanced when the canvas can fit three cards per row. */
@container (min-width: 900px) and (max-width: 1168px) {
  .generation-stage.is-image:has(> .generation-frame:nth-child(4):last-child) > .generation-frame:last-child {
    grid-column: 1 / -1;
    width: min(100%, calc((100% - 24px) / 3));
    justify-self: center;
  }
}
.result-workspace { padding: 32px 0 24px; }
.result-heading { align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.result-heading > div { min-width: 0; }
.result-heading .eyebrow { margin: 0 0 4px; font-weight: 600; }
.result-heading-complete { align-items: flex-end; flex-wrap: wrap; }
.result-heading-complete > div:first-child { flex: 1 1 240px; }
.result-heading-title-line { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; }
.result-heading h2 { font-size: 20px; font-weight: 700; line-height: 1.4; }
.result-heading-actions { display: flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 8px; }
.result-count-pill { display: inline-flex; flex: 0 0 auto; align-items: center; min-height: 22px; padding: 2px 8px; border-radius: var(--creator-radius-small); white-space: nowrap; color: #4c756f; background: #e5efec; font-size: 12px; font-weight: 600; line-height: 18px; font-variant-numeric: tabular-nums; }
.result-heading-actions .secondary-command,
.result-heading-actions .icon-action { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: 6px; width: auto; min-height: 34px; height: 34px; padding: 0 12px; white-space: nowrap; font-size: 12px; font-weight: 600; line-height: 1; border-color: #d6e4e1; color: #3f5d59; }
.result-heading-actions svg { flex: 0 0 auto; }
.result-heading-actions button > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.result-heading-actions .download-all-command:disabled { cursor: wait; opacity: .68; }
.result-heading-actions .primary-soft { border-color: var(--creator-accent); color: #fff; background: var(--creator-accent); }
.result-heading-actions .primary-soft:hover { border-color: var(--creator-accent-strong); background: var(--creator-accent-strong); }
.complete-video-card { overflow: hidden; margin-bottom: 24px; border: 1px solid #cadbd8; border-radius: var(--creator-radius-large); background: rgb(255 255 255 / 84%); box-shadow: 0 12px 30px rgb(25 74 67 / 10%); }
.complete-video-card > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-bottom: 1px solid #dce7e5; }
.complete-video-card > header > div { min-width: 0; }
.complete-video-card > header .eyebrow { margin: 0 0 4px; font-weight: 600; }
.complete-video-card > header h3 { margin: 0; color: #172033; font-size: 16px; font-weight: 700; line-height: 1.4; }
.complete-video-card > header p:last-child { display: -webkit-box; max-width: 650px; margin: 5px 0 0; font-weight: 400; overflow: hidden; color: #718094; font-size: 11px; line-height: 1.65; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.complete-video-card > header > span { flex: 0 0 auto; padding: 7px 11px; border: 1px solid #d4e3e0; border-radius: var(--creator-radius-small); white-space: nowrap; color: #5d716d; background: #f7faf9; font-size: 10px; }
.complete-video-frame,
.video-result-frame { position: relative; width: 100%; overflow: hidden; }
.complete-video-frame { display: grid; width: calc(100% - 32px); margin: 16px 16px 0; border-radius: var(--creator-radius); max-height: min(58vh, 620px); }
.video-result-frame { display: grid; border-radius: inherit; max-height: min(58vh, 620px); }
/* Only the ring spins; the icon stays upright so the motion reads as one calm loop. */
.video-loading-spinner { position: relative; display: inline-grid; width: 52px; height: 52px; place-items: center; border-radius: 50%; color: var(--creator-accent); background: #fff; box-shadow: 0 6px 18px rgb(25 74 67 / 10%); }
.video-loading-spinner::before { position: absolute; inset: -4px; border: 2px solid rgb(17 160 140 / 14%); border-top-color: var(--creator-accent); border-radius: 50%; content: ""; animation: creatorSpin 900ms linear infinite; }
.video-loading-spinner svg { width: 20px; height: 20px; }
@media (prefers-reduced-motion: reduce) { .video-loading-spinner::before { animation-duration: 2400ms; } }
/* Equal vertical padding keeps the download button centered between the video and the card's bottom edge. */
.complete-video-card > footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 66px; padding: 16px; }
.complete-video-card > footer > div { min-width: 0; flex: 1; }
.complete-video-card > footer strong { display: block; color: var(--creator-accent-strong); font-size: 14px; line-height: 1.4; }
.complete-video-card > footer .result-tags { margin-top: 8px; }
.complete-video-card > footer .secondary-command { display: inline-flex; align-items: center; flex: 0 0 auto; gap: 6px; border-color: #9fddd3; color: var(--creator-accent-strong); background: #f0fbf8; }
.complete-video-pending { display: grid; min-height: 290px; justify-items: center; place-content: center; padding: 32px; color: var(--creator-accent-strong); text-align: center; }
.complete-video-pending > span { display: grid; width: 54px; height: 54px; place-items: center; border: 1px solid #a9e3d9; border-radius: var(--creator-radius); background: #ecfbf7; }
.complete-video-pending strong { margin-top: 14px; color: #263347; }
.complete-video-pending p { max-width: 520px; margin: 7px 0 17px; color: #7c8b9e; font-size: 11px; }
.complete-video-pending.failed { color: #b64b42; }
.complete-video-pending.failed > span { border-color: #e7b4ae; background: #fff5f3; }
.segment-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin: 2px 0 12px; }
.segment-heading .eyebrow { margin: 0 0 4px; font-weight: 600; }
.segment-heading h3 { margin: 0; color: #263347; font-size: 16px; font-weight: 700; }
.segment-heading > span { color: #8593a5; font-size: 11px; }
.result-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.result-grid.single { grid-template-columns: minmax(0, 1fr); }
.result-card { position: relative; overflow: hidden; border: 1px solid #d9e4e2; background: #fff; box-shadow: 0 8px 22px rgb(25 74 67 / 8%); }
/* Media sits flush against the card edge: round only the top corners (outer radius minus the 1px border) so it meets the caption without a gap. */
.result-card > .result-media,
.result-card > .video-result-frame { border-radius: calc(var(--creator-radius-large) - 1px) calc(var(--creator-radius-large) - 1px) 0 0; }
.result-index { position: absolute; z-index: 2; top: 12px; left: 12px; display: grid; place-items: center; min-width: 28px; height: 25px; padding: 0 7px; border-radius: var(--creator-radius-small); color: #fff; background: rgb(28 39 52 / 62%); font-size: 10px; font-weight: 800; backdrop-filter: blur(5px); transition: opacity 160ms ease; }
/* While a segment plays, the number hides like the player's own badge and returns on hover or tap. */
.result-card:has(.video-result-frame.is-playing) .result-index { opacity: 0; }
.result-card:has(.video-result-frame.is-playing.controls-visible) .result-index { opacity: 1; }
@media (hover: hover) {
  .result-card:has(.video-result-frame.is-playing:hover) .result-index { opacity: 1; }
}
.result-media {
  position: relative;
  display: grid;
  width: 100%;
  height: clamp(340px, 55vh, 500px);
  place-items: center;
  overflow: hidden;
  background: #e8f0ee;
}
.result-media.landscape { height: auto; }
.result-media.fitted { height: auto; max-height: clamp(340px, 70vh, 720px); }
.result-media img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.result-media.landscape img { object-fit: cover; }
.result-media.video { display: block; width: 100%; height: auto; object-fit: contain; }
.result-actions { justify-content: space-between; gap: 16px; min-height: 76px; padding: 12px 14px 12px 16px; border-top: 1px solid #e6eeec; color: #64748b; font-size: 13px; }
.result-description { min-width: 0; flex: 1; }
.result-description strong { display: block; color: var(--creator-accent-strong); font-size: 14px; line-height: 1.4; }
.result-model { display: block; overflow: hidden; margin-top: 5px; color: #718096; font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.result-meta { display: flex; flex-wrap: wrap; gap: 2px 0; margin-top: 5px; color: #718096; font-size: 12px; line-height: 1.5; }
.result-meta > span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-meta > span + span::before { content: '·'; margin: 0 6px; color: #b4bfcc; }
.result-description p { overflow: hidden; margin: 7px 0 0; color: #526176; font-size: 13px; line-height: 1.55; text-overflow: ellipsis; white-space: nowrap; }
.result-description p.result-prompt { display: -webkit-box; margin-top: 4px; color: #7b8b8e; font-size: 12px; line-height: 1.5; text-overflow: initial; white-space: normal; word-break: break-word; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.result-media-actions { display: flex; flex: 0 0 auto; gap: 6px; }
/* 图片与视频共用卡片排版，不依赖参数标签是否存在。 */
.result-card > .result-actions { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "title actions" "prompt prompt" "tags tags"; align-items: center; column-gap: 12px; row-gap: 0; }
.result-card > .result-actions > .result-description { display: contents; }
.result-card > .result-actions > .result-description > strong { grid-area: title; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.result-card > .result-actions > .result-description > p.result-prompt { grid-area: prompt; margin-top: 8px; }
.result-card > .result-actions > .result-media-actions { grid-area: actions; }
.result-card > .result-actions > .result-tags { grid-area: tags; margin-top: 10px; }
.result-tags { display: flex; flex: 1 0 100%; flex-wrap: wrap; gap: 6px; min-width: 0; margin: 0; padding: 0; list-style: none; }
.result-tags li { max-width: 100%; overflow: hidden; padding: 2px 8px; border-radius: 999px; color: #5b6b7f; background: #eef3f2; font-size: 12px; line-height: 1.5; text-overflow: ellipsis; white-space: nowrap; }
.result-workspace .icon-action,
.result-workspace .secondary-command { border-radius: var(--creator-radius); }
.result-media-actions .icon-action { width: 32px; height: 32px; }
.result-error { display: grid; justify-items: center; padding: 80px 24px; border: 1px dashed #e7b4ae; border-radius: var(--creator-radius-large); color: #b64b42; background: #fff8f7; text-align: center; }
.result-error strong { margin-top: 14px; color: #7b312b; }
.result-error p { margin: 7px 0 18px; color: #98635e; font-size: 12px; }
.result-error.muted { border-color: #cbdad7; color: #758a87; background: #f5f9f8; }
.result-error.muted strong { color: #4c615e; }
.result-error.muted p { color: #7d8c8a; }
.partial-result-notice { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 12px 14px; border: 1px solid #f0d9a8; border-radius: var(--creator-radius); color: #a26a12; background: #fffaf0; }
.partial-result-notice > div { flex: 1; min-width: 0; }
.partial-result-notice strong { display: block; color: #7a4f0d; font-size: 13px; }
.partial-result-notice p { margin: 3px 0 0; color: #94723c; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }
.partial-result-notice .secondary-command { flex-shrink: 0; }
.status-check-icon { animation: creatorSpin .85s linear infinite; }
.status-check-command { display: inline-flex; align-items: center; gap: 7px; border-color: #8eddd0; color: var(--creator-accent-strong); background: #effbf8; }
.status-check-command:disabled { cursor: wait; opacity: .68; }
.video-status-feedback { display: flex; align-items: flex-start; gap: 7px; width: fit-content; max-width: min(460px, 100%); margin-top: 13px; padding: 10px 12px; border: 1px solid #cce4df; border-radius: var(--creator-radius); color: #52706b; background: #fff; font-size: 11px; line-height: 1.6; text-align: left; }
.video-status-feedback svg { flex: 0 0 auto; margin-top: 2px; }
.video-status-feedback.is-error { border-color: #edc5c0; color: #9a4b43; background: #fff9f8; }
.result-parameters { container-type: inline-size; margin-top: 14px; }
/* One grouped panel with hairline dividers instead of six separate tiles. */
.result-stat-grid { display: grid; grid-auto-flow: row dense; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1px; overflow: hidden; border: 1px solid #d6e2e0; border-radius: var(--creator-radius-large); background: #fbfdfd; }
.result-card { border-radius: var(--creator-radius-large); }
/* Spread shadows draw the cell dividers so a partially filled last row stays clean. */
.result-stat-grid article { min-width: 0; padding: 12px 14px; background: #fbfdfd; box-shadow: 0 0 0 1px #e2ebe9; }
.result-stat-grid article.wide { grid-column: span 2; }
.result-stat-grid span { display: block; color: #64748b; font-size: 10px; }
.result-stat-grid strong { display: block; overflow: hidden; margin-top: 6px; color: #263549; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
@container (min-width: 420px) { .result-stat-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@container (min-width: 600px) { .result-stat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container (min-width: 880px) { .result-stat-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
.result-stat-grid .result-prompt-cell { grid-column: 1 / -1; }
.result-prompt-cell .full-prompt { margin: 6px 0 0; color: #334155; font-size: 12px; line-height: 1.75; white-space: pre-wrap; overflow-wrap: anywhere; }
.result-prompt-cell .full-prompt.clamped { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
.result-prompt-toggle { display: inline-flex; align-items: center; gap: 3px; margin-top: 6px; padding: 0; border: 0; color: var(--creator-accent-strong); background: none; font-size: 12px; cursor: pointer; }
.result-prompt-toggle svg { transition: transform 160ms ease; }
.result-prompt-toggle[aria-expanded="true"] svg { transform: rotate(180deg); }
.result-prompt-toggle:focus-visible { border-radius: 4px; outline: 2px solid var(--creator-accent-strong); outline-offset: 2px; }
.secondary-command { min-height: 38px; padding: 0 14px; border: 1px solid #d8b3ad; border-radius: var(--creator-radius); background: #fff; font-size: 12px; font-weight: 700; }

.professional-workspace { align-self: stretch; margin-top: 28px; margin-bottom: 70px; padding: 18px; border: 1px solid #d4e2df; border-radius: var(--creator-radius-large); background: rgb(255 255 255 / 76%); box-shadow: 0 14px 32px rgb(36 78 72 / 8%); }
.sequence-shot { cursor: pointer; }
.sequence-shot.active { border-color: #55d4c2; background: #f0fcf9; box-shadow: 0 7px 18px rgb(24 138 121 / 10%); }
.sequence-shot:focus-visible { outline: 2px solid #39b9a5; outline-offset: 2px; }
.sequence-shot.active .sequence-shot-index { border-color: #0f9f8f; color: #fff; background: #0f9f8f; }
.sequence-header { display: grid; grid-template-columns: minmax(0, 1fr) auto 36px; align-items: center; gap: 18px; padding-bottom: 14px; border-bottom: 1px solid #dce8e5; }
.sequence-eyebrow { display: flex; align-items: center; gap: 6px; margin: 0 0 8px; color: var(--creator-accent-strong); font-size: 10px; font-weight: 850; letter-spacing: .04em; }
.sequence-eyebrow i { width: 7px; height: 7px; border-radius: 50%; background: #39d6bd; box-shadow: 0 0 0 4px #e0faf5; }
.sequence-header h2 { display: flex; align-items: center; gap: 10px; margin: 0; color: #1f2d3d; font-size: 16px; font-weight: 750; }
.sequence-header h2 span { display: inline-flex; min-height: 24px; align-items: center; padding: 0 8px; border: 1px solid #b9e1da; border-radius: var(--creator-radius-small); color: var(--creator-accent-strong); background: #effbf8; font-size: 11px; font-weight: 750; font-variant-numeric: tabular-nums; }
.sequence-header > div:first-child > p:last-child { margin: 4px 0 0; color: #8a98aa; font-size: 12px; }
.sequence-header dl { display: flex; margin: 0; }
.sequence-header dl > div { min-width: 76px; padding: 0 16px; border-left: 1px solid #dae5e3; }
.sequence-header dt { color: #91a0b2; font-size: 10px; }
.sequence-header dd { margin: 4px 0 0; color: #273548; font-size: 14px; font-weight: 750; font-variant-numeric: tabular-nums; }
.sequence-add { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid #92e3d5; border-radius: var(--creator-radius); color: var(--creator-accent-strong); background: #edfcf9; }
.sequence-ruler { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; margin: 12px 0 10px; color: #8fa0b4; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sequence-ruler i { height: 1px; background: repeating-linear-gradient(90deg, #b9d6d1 0 1px, transparent 1px 22%); border-bottom: 1px solid #d4e3e0; }
/* Two cards per row only when each still has room for a readable description. */
.sequence-track { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 12px; padding: 2px 2px 8px; }
.sequence-shot { position: relative; display: grid; grid-template-columns: 84px minmax(0, 1fr); width: 100%; gap: 12px; min-height: 136px; padding: 12px 12px 12px 52px; border: 1px solid #d6e3e1; border-radius: var(--creator-radius-large); background: #fff; }
.sequence-shot::before { position: absolute; top: 42px; bottom: 12px; left: 27px; width: 1px; background: #d9e8e5; content: ''; }
.sequence-shot-index { position: absolute; top: 12px; left: 12px; display: grid; place-items: center; width: 30px; height: 24px; border: 1px solid #b9e1da; border-radius: var(--creator-radius-small); color: var(--creator-accent-strong); background: #effbf8; font-size: 11px; font-weight: 800; }
.sequence-shot-preview { position: relative; display: grid; place-items: center; min-height: 100px; overflow: hidden; border: 1px solid #d6e4e1; border-radius: var(--creator-radius); color: var(--creator-accent-strong); background: linear-gradient(135deg, #e8f6f3, #f7fbfa); }
.sequence-shot-preview::before { position: absolute; top: 11px; left: 10px; width: 38px; height: 15px; border-top: 1px solid #bddbd5; border-left: 1px solid #bddbd5; transform: skewX(-28deg); content: ''; }
.sequence-shot-preview > span { position: relative; display: grid; z-index: 1; place-items: center; width: 36px; height: 36px; border: 1px solid #73dac9; border-radius: 50%; background: #dff9f4; }
.sequence-shot-preview small { position: absolute; right: 7px; bottom: 6px; color: #68867f; font-size: 10px; font-weight: 750; font-variant-numeric: tabular-nums; }
.sequence-shot-content { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.sequence-shot-content > header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 24px; }
.sequence-shot-content > header > strong { color: #64748b; font-size: 11px; letter-spacing: .03em; }
.sequence-shot-content > header > span { display: flex; align-items: center; gap: 4px; color: #91a0b2; font-size: 10px; }
.sequence-shot-content > header > span i { width: 5px; height: 5px; border-radius: 50%; background: #c4d0d8; }
.sequence-shot-content > header > div { display: flex; gap: 1px; margin-left: auto; }
.sequence-shot-content > header button { display: grid; place-items: center; width: 24px; height: 24px; border-radius: var(--creator-radius-small); color: #718096; }
.sequence-shot-content > header button:hover:not(:disabled) { color: var(--creator-accent-strong); background: #eff9f7; }
.sequence-shot-content > header button:disabled { opacity: .25; }
.sequence-shot-prompt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; flex: none; margin: 0; padding: 0; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; color: #344054; font-size: 12px; line-height: 1.6; }
.sequence-shot-prompt.empty { color: #a7b3c0; }
.sequence-shot-content footer { display: flex; flex-shrink: 0; margin-top: auto; flex-wrap: wrap; align-items: center; gap: 5px; }
.sequence-shot-content footer > span { padding: 2px 7px; border: 1px solid #d7e5e2; border-radius: var(--creator-radius-small); color: #607b76; background: #f5faf9; font-size: 10px; }
.sequence-inline-add { display: flex; grid-column: 1 / -1; width: 100%; min-height: 52px; align-items: center; justify-content: center; gap: 7px; border: 1px dashed #9ccfc6; border-radius: var(--creator-radius); color: var(--creator-accent-strong); background: #f3fbf9; font-size: 12px; font-weight: 700; }
.sequence-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #dce8e5; color: #73869a; font-size: 11px; }
.sequence-footer > span { display: flex; align-items: center; gap: 5px; }
.sequence-footer strong { color: #6f8092; font-size: 11px; }
.sequence-footer strong.invalid { color: #c9463b; }

.settings-panel {
  min-height: 0;
  align-self: stretch;
  height: 100%;
  overflow: hidden;
  border-left: 1px solid var(--creator-line);
}
.settings-scroll {
  box-sizing: border-box;
  height: 100%;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  overflow-anchor: none;
  padding: 22px 20px 28px;
  scrollbar-gutter: stable;
  scrollbar-color: #c5cbd1 transparent;
  scrollbar-width: thin;
}
.settings-scroll::-webkit-scrollbar { width: 8px; }
.settings-scroll::-webkit-scrollbar-track { background: transparent; }
.settings-scroll::-webkit-scrollbar-thumb { border: 2px solid #fff; border-radius: 999px; background: #c5cbd1; }
.settings-scroll::-webkit-scrollbar-thumb:hover { background: #9ba4ad; }
.settings-heading { justify-content: space-between; margin-bottom: 16px; }
.settings-heading > svg { color: var(--creator-accent-strong); }
.capability-switch { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; margin-bottom: 20px; padding: 4px; border: 1px solid #d8e4e2; border-radius: var(--creator-radius-large); background: #eff5f4; }
.capability-switch button { min-height: 45px; border-radius: var(--creator-radius); color: #6e7e93; font-size: 12px; font-weight: 700; white-space: nowrap; }
.capability-switch button.active { color: var(--creator-accent-strong); background: #fff; box-shadow: 0 3px 12px rgb(26 76 70 / 9%); }
.capability-switch button:disabled { color: #b4c0cc; cursor: not-allowed; }
.field-block { margin-bottom: 16px; }
.field-block > label,
.field-row label { display: block; margin-bottom: 7px; color: #4b5b70; font-size: 12px; font-weight: 750; }
.field-block > small,
.field-row small { display: block; margin-top: 6px; color: #8492a6; font-size: 10px; line-height: 1.5; }
.creator-field-hint { color: var(--creator-accent-strong) !important; }
.studio-input { width: 100%; min-height: 42px; padding: 0 12px; border: 1px solid #d7e0e7; border-radius: var(--creator-radius); outline: none; color: #1b2638; background: #fff; font-size: 12px; transition: 150ms ease; }
.studio-input:focus { border-color: #6dd4c4; box-shadow: 0 0 0 3px rgb(41 185 164 / 12%); }
.studio-input:disabled { cursor: not-allowed; color: #97a3b2; background: #f4f6f7; }
.model-input { height: 42px; contain: layout; }
.model-input.is-loading:disabled:not(:invalid) { color: #1b2638; background: #fff; }
.model-compatibility-error { color: #b42318 !important; }
textarea.studio-input { padding: 10px 12px; resize: vertical; }
.image-size-trigger { display: flex; align-items: center; justify-content: space-between; text-align: left; }
.image-output-fields.single-output-field { grid-template-columns: minmax(0, 1fr); }
.image-size-trigger svg { flex: 0 0 auto; color: #8c9aab; }
.image-size-dialog { color: #354258; }
.image-size-current { margin: 0 0 16px; color: #91a0b3; font-size: 12px; }
.image-size-current strong { color: #627086; font-variant-numeric: tabular-nums; }
.image-size-mode-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin-bottom: 22px; padding: 5px; border-radius: var(--creator-radius-large); background: #eef4f3; }
.image-size-mode-tabs button { min-height: 46px; border-radius: var(--creator-radius); color: #68788e; font-size: 13px; font-weight: 750; }
.image-size-mode-tabs button.active { color: #172236; background: #fff; box-shadow: 0 4px 14px rgb(25 58 54 / 9%); }
.video-aspect-source-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-bottom: 0; }
.image-size-section + .image-size-section { margin-top: 20px; }
.image-size-section h4,
.image-custom-size h4 { margin: 0 0 10px; color: #8796a9; font-size: 12px; font-weight: 750; }
.image-resolution-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.image-resolution-grid button { min-height: 50px; border: 1px solid #d8e2e1; border-radius: var(--creator-radius); color: #65758a; background: #fff; font-size: 14px; font-weight: 800; transition: 150ms ease; }
.image-resolution-grid button.active { border-color: #3ad5c0; color: #087f74; background: #effbf8; }
.image-ratio-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
.video-aspect-source-hint { margin: -2px 0 10px; color: var(--creator-accent-strong); }
.image-ratio-grid button { display: grid; min-height: 80px; place-items: center; align-content: center; gap: 7px; border: 1px solid #d8e2e8; border-radius: var(--creator-radius); color: #66768c; background: #fff; font-size: 12px; font-weight: 750; transition: 150ms ease; }
.image-ratio-grid button:disabled { opacity: .4; cursor: not-allowed; }
.image-size-tier-hint { margin-top: 10px; color: #66768c; font-size: 12px; line-height: 1.6; }
.image-ratio-grid button i { display: block; box-sizing: border-box; border: 2px solid #95a4b7; border-radius: 3px; }
.image-ratio-grid button.active { border-color: #3ad5c0; color: #087f74; background: #effbf8; }
.image-ratio-grid button.active i { border-color: #4f9e94; }
.custom-ratio-command { width: 100%; min-height: 42px; margin-top: 10px; border: 1px solid #d8e3e1; border-radius: var(--creator-radius); color: #6a7a8e; background: #fff; font-size: 12px; font-weight: 700; }
.image-size-auto-panel { display: grid; min-height: 280px; place-items: center; align-content: center; gap: 12px; text-align: center; }
.image-size-auto-panel > span { display: grid; place-items: center; width: 64px; height: 64px; border-radius: var(--creator-radius-large); color: #087f74; background: #e7f8f5; }
.image-size-auto-panel strong { color: #334155; font-size: 15px; }
.image-size-auto-panel p { max-width: 330px; margin: 0; color: #93a2b5; font-size: 12px; line-height: 1.7; }
.image-custom-size > div { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: end; gap: 12px; }
.image-custom-size label { color: #607087; font-size: 12px; font-weight: 700; }
.image-custom-size input { width: 100%; min-height: 50px; margin-top: 8px; padding: 0 14px; border: 1px solid #d7e0e7; border-radius: var(--creator-radius); outline: 0; color: #314057; background: #fff; font-size: 14px; }
.image-custom-size > div > span { padding-bottom: 15px; color: #a1afbf; font-weight: 800; }
.image-custom-size > p { margin: 14px 0 0; padding: 13px 15px; border: 1px solid #d8e8e4; border-radius: var(--creator-radius); color: #64758b; background: #f6faf9; font-size: 11px; line-height: 1.75; }
.image-size-result { margin-top: 22px; padding: 17px 18px; border-radius: var(--creator-radius-large); background: #f4f8f7; }
.image-size-result span,
.image-size-result strong { display: block; }
.image-size-result span { color: #92a0b2; font-size: 11px; }
.image-size-result strong { margin-top: 7px; color: #152136; font-size: 18px; font-variant-numeric: tabular-nums; }
.video-params-result { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
.video-params-cost { text-align: right; }
.video-params-cost strong { color: #087f74; }
.image-size-cancel,
.image-size-confirm { min-width: 0; min-height: 48px; flex: 1; border-radius: var(--creator-radius); font-size: 14px; font-weight: 750; transition: 150ms ease; }
.image-size-cancel { color: #687990; background: #f1f5f9; }
.image-size-confirm { color: #fff; background: #087f74; }
.image-size-cancel:hover { color: #45566c; background: #e8eef4; }
.image-size-confirm:hover { background: #066d64; box-shadow: 0 8px 18px rgb(8 127 116 / 20%); }
.key-ready { gap: 9px; min-height: 62px; margin-bottom: 18px; padding: 10px 12px; border: 1px solid #9ce2bf; border-radius: var(--creator-radius-large); color: #27835c; background: #f0fcf5; }
.key-ready > div { min-width: 0; flex: 1; }
.key-ready strong,
.key-ready span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-ready strong { color: #256c4e; font-size: 12px; }
.key-ready span { margin-top: 3px; color: #67917c; font-size: 10px; }
.key-ready > small { color: #779488; font-size: 10px; }
.key-needed { margin-bottom: 18px; padding: 14px; border: 1px solid #eecf67; border-radius: var(--creator-radius-large); background: #fffbed; }
.key-needed-title { align-items: flex-start; gap: 12px; }
.key-needed-title > span { display: grid; flex: 0 0 42px; place-items: center; width: 42px; height: 42px; border-radius: var(--creator-radius-small); color: var(--creator-accent-strong); background: #fff; }
.key-needed-title strong { font-size: 13px; }
.key-needed-title p { margin: 4px 0; color: #7c8799; font-size: 12px; }
.key-needed-title small { color: #9ba5b4; font-size: 10px; }
.key-needed > button,
.generate-button { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 46px; margin-top: 13px; border-radius: var(--creator-radius); color: #fff; background: var(--creator-accent); font-size: 13px; font-weight: 750; box-shadow: 0 5px 12px rgb(15 159 143 / 18%); transition: 150ms ease; }
.key-needed > button:hover,
.generate-button:hover { background: var(--creator-accent-strong); }
.key-needed > button:disabled,
.generate-button:disabled { cursor: not-allowed; box-shadow: none; opacity: .45; }
.generation-requirement { margin: 10px 0 0; padding: 10px 12px; border: 1px solid #f2c14e; border-radius: var(--creator-radius); color: #9a6200; background: #fffaf0; font-size: 11px; font-weight: 700; text-align: center; }
.settings-scroll hr { margin: 17px 0; border: 0; border-top: 1px solid var(--creator-line); }
.prompt-tool { display: block; width: 100%; margin-bottom: 18px; padding: 10px; border: 1px solid #d4e3e0; border-radius: var(--creator-radius-large); text-align: left; background: #fbfdfd; }
.prompt-tool > header { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 9px; }
.prompt-tool.expanded > header { padding-bottom: 9px; border-bottom: 1px solid #e4eceb; }
.prompt-tool > header > span:first-child { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid #8ae6d6; border-radius: var(--creator-radius-small); color: var(--creator-accent-strong); background: #ecfcf8; }
.prompt-tool header strong,
.prompt-tool header small { display: block; }
.prompt-tool header strong { color: #223044; font-size: 12px; }
.prompt-tool header small { overflow: hidden; margin-top: 3px; color: #8190a2; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.prompt-tool-controls { display: flex; align-items: center; gap: 6px; }
.prompt-page-actions { display: flex; align-items: center; gap: 4px; color: #7f8da0; font-size: 9px; font-variant-numeric: tabular-nums; }
.prompt-page-actions button { display: grid; place-items: center; width: 26px; height: 26px; border: 1px solid #d4e1df; border-radius: var(--creator-radius-small); color: #52716d; background: #fff; }
.prompt-page-actions button:hover:not(:disabled) { border-color: #8edacd; color: var(--creator-accent-strong); }
.prompt-page-actions button:disabled { opacity: .35; }
.prompt-toggle { min-height: 30px; padding: 0 10px; border: 1px solid #cddddd; border-radius: var(--creator-radius-small); color: var(--creator-accent-strong); background: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; }
.prompt-toggle:hover { border-color: #8edacd; background: #f2fbf9; }
.prompt-template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding-top: 9px; }
.prompt-template-grid button { min-width: 0; min-height: 48px; padding: 8px 9px; border: 1px solid #dce5eb; border-radius: var(--creator-radius); text-align: left; background: #fff; transition: 150ms ease; }
.prompt-template-grid button:hover,
.prompt-template-grid button.active { border-color: #7dd9ca; background: #f1fbf8; }
.prompt-template-grid strong,
.prompt-template-grid small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prompt-template-grid strong { color: #465468; font-size: 10px; }
.prompt-template-grid small { margin-top: 3px; color: #91a0b2; font-size: 9px; }
.field-row { align-items: flex-start; justify-content: space-between; gap: 12px; }
.field-row > span { display: flex; align-items: center; gap: 4px; color: #91a0b5; font-size: 10px; }
.reference-field .field-row { margin-bottom: 10px; }
.prompt-field > small { margin-top: -4px; margin-bottom: 8px; }
.prompt-input { min-height: 156px; line-height: 1.75; }
.inline-command { display: inline-flex; align-items: center; gap: 5px; color: #59687b; font-size: 11px; font-weight: 650; }
.inline-command:hover { color: var(--creator-accent-strong); }
.upload-zone { display: grid; justify-items: center; width: 100%; min-height: 112px; padding: 15px; border: 1px dashed #b9cad7; border-radius: var(--creator-radius-large); color: #8a9bb0; background: #fafcfd; }
.upload-zone:hover,
.upload-zone.dragging { border-color: #53cdb9; color: var(--creator-accent-strong); background: #f1fbf8; }
.upload-zone strong { margin-top: 7px; color: #5c6b7f; font-size: 11px; }
.upload-zone span { margin-top: 4px; font-size: 9px; }
.reference-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
.reference-item { position: relative; aspect-ratio: 1; overflow: hidden; border: 1px solid #d8e2e7; border-radius: var(--creator-radius); background: #edf2f3; }
.reference-item img { width: 100%; height: 100%; object-fit: cover; }
.reference-item button { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border: 0; color: #fff; background: rgb(22 30 42 / 70%); }
.history-reference-note { margin: 8px 0 0; color: #8a98aa; font-size: 10px; line-height: 1.5; }
.two-column-fields,
.advanced-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.advanced-grid { grid-template-columns: minmax(0, 1fr); margin-bottom: 16px; padding: 12px; border: 1px solid #e0e7eb; border-radius: var(--creator-radius-large); background: #f8fafb; }
.advanced-grid .field-block { margin-bottom: 0; }
.advanced-grid .field-block.wide { grid-column: 1 / -1; }
.gif-frame-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.gif-frame-fields .field-block > small { color: #73869a; font-size: 11px; line-height: 1.65; }
.stepper { min-height: 44px; border: 1px solid #d7e0e7; border-radius: var(--creator-radius); overflow: hidden; }
.stepper button { display: grid; place-items: center; width: 46px; height: 42px; color: var(--creator-accent-strong); background: #fff; }
.stepper button:first-child { border-right: 1px solid #e0e6eb; }
.stepper button:last-child { border-left: 1px solid #e0e6eb; }
.stepper button:disabled { color: #c2cbd5; }
.stepper strong { flex: 1; text-align: center; color: #455267; font-size: 13px; }
.stepper-value { display: flex; flex: 1; align-self: stretch; align-items: center; justify-content: center; gap: .3em; min-width: 0; color: #455267; font-size: 13px; font-weight: 700; cursor: text; transition: background-color .15s; }
.stepper-value:hover,
.stepper-value:focus-within { background: #f7f9fb; }
.stepper-value input { width: 2ch; min-width: 1ch; padding: 0; border: 0; color: inherit; font: inherit; font-variant-numeric: tabular-nums; text-align: center; background: transparent; outline: none; appearance: textfield; -moz-appearance: textfield; }
.stepper-value input::-webkit-inner-spin-button,
.stepper-value input::-webkit-outer-spin-button { margin: 0; -webkit-appearance: none; }
.toggle-row { position: relative; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 12px; border: 1px solid #dbe5e3; border-radius: var(--creator-radius-large); background: #f8fbfa; cursor: pointer; }
.toggle-row.wide { grid-column: 1 / -1; margin: 0; }
.toggle-row span { min-width: 0; }
.toggle-row strong,
.toggle-row small { display: block; }
.toggle-row strong { color: #435268; font-size: 12px; }
.toggle-row small { margin-top: 3px; color: #8b98a9; font-size: 9px; }
.toggle-row input { position: absolute; opacity: 0; }
.toggle-row i { position: relative; flex: 0 0 38px; width: 38px; height: 22px; border-radius: 11px; background: #cbd5df; transition: 160ms ease; }
.toggle-row i::after { position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgb(0 0 0 / 18%); content: ''; transition: 160ms ease; }
.toggle-row input:checked + i { background: var(--creator-accent); }
.toggle-row input:checked + i::after { transform: translateX(16px); }
.toggle-row input:disabled + i { opacity: .4; }
.professional-toggle { display: grid; grid-template-columns: 24px max-content minmax(0, 1fr) 16px; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #cbd8e8; border-radius: var(--creator-radius-large); background: #fafbfe; box-shadow: none; }
.professional-toggle-icon { display: grid; grid-column: 1; place-items: center; width: 24px; height: 24px; border-radius: var(--creator-radius-small); color: #6f86a6; background: #dceaff; }
.professional-toggle-copy { grid-column: 2; white-space: nowrap; }
.professional-toggle-copy strong { color: #26364f; font-size: 12px; font-weight: 600; line-height: 1.5; }
.professional-toggle-copy small { display: none; }
.professional-toggle-hint { grid-column: 3; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #71829c; font-size: 10px; font-weight: 400; line-height: 1.5; }
.professional-toggle-chevron { grid-column: 4; color: #657994; }
.video-control-row { box-sizing: border-box; height: 52px; min-height: 52px; flex-shrink: 0; padding-top: 0; padding-bottom: 0; }
.stepper.video-control-row button { height: 100%; }
.generate-button { min-height: 52px; margin-top: 6px; font-size: 14px; }
.button-spinner { width: 16px; height: 16px; border: 2px solid rgb(255 255 255 / 45%); border-top-color: #fff; border-radius: 50%; animation: creatorSpin .8s linear infinite; }
.spinning { animation: creatorSpin .8s linear infinite; }


.settings-heading > svg { width: 16px; height: 16px; }

.modal-backdrop { position: fixed; z-index: 70; inset: 0; display: grid; place-items: center; padding: 24px; background: rgb(15 23 42 / 58%); backdrop-filter: blur(5px); }
/* The bottom band is reserved for the action buttons: 16px below them, 36px button, 16px above.
   The top gets the same band so the image stays vertically centred. */
.image-preview {
  --preview-actions-bottom: calc(16px + env(safe-area-inset-bottom, 0px));
  --preview-actions-reserve: calc(var(--preview-actions-bottom) + 52px);
  z-index: 80;
  background: rgb(15 23 42 / 80%);
}
.modal-backdrop.image-preview { padding: var(--preview-actions-reserve) 24px; }
.image-preview-content { --creator-image-background: transparent; --creator-image-text: #dce8e5; width: calc(100vw - 48px); height: calc(100dvh - 2 * var(--preview-actions-reserve)); max-width: 1600px; border-radius: var(--creator-radius-large); }
.preview-close { position: fixed; z-index: 1; top: 18px; right: 18px; border-color: rgb(255 255 255 / 30%); color: #fff; background: rgb(17 24 39 / 75%); }
.preview-nav {
  position: fixed;
  z-index: 1;
  top: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: 1px solid rgb(255 255 255 / 25%);
  border-radius: 50%;
  color: #fff;
  background: rgb(17 24 39 / 65%);
  cursor: pointer;
  transform: translateY(-50%);
  transition: background-color 140ms ease, border-color 140ms ease;
}
.preview-nav:hover { border-color: rgb(255 255 255 / 45%); background: rgb(17 24 39 / 85%); }
.preview-nav:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.preview-nav.is-prev { left: 18px; }
.preview-nav.is-next { right: 18px; }
/* Sits in the reserved band below the image. */
.preview-actions { position: fixed; z-index: 1; bottom: var(--preview-actions-bottom); left: 50%; display: flex; gap: 10px; transform: translateX(-50%); }
.preview-action { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 16px; border: 1px solid rgb(255 255 255 / 25%); border-radius: var(--creator-radius); color: #fff; font-size: 13px; font-weight: 600; white-space: nowrap; background: rgb(17 24 39 / 65%); }
.preview-action:disabled { cursor: wait; opacity: .6; }

@keyframes creatorSpin { to { transform: rotate(360deg); } }
@keyframes creatorTwinkle { 50% { opacity: .55; transform: scale(.88) rotate(-8deg); } }
@keyframes creatorShimmer { from { background-position: 100% 0; } to { background-position: -100% 0; } }
@keyframes creatorFrameIn { from { opacity: 0; transform: scale(.96); } }
@keyframes creatorStatusPulse { to { opacity: .35; transform: scale(.92); } }
/* 头部 = u + s·u(1-u)，尾部 = u - s·u(1-u)：两端都只向右走，长度 200s·u(1-u)% 中段最长（长段 s=1 → 50%，短段 s=.5 → 25%），出右端时收成 0 */
@keyframes creatorProgressLong {
  0% { clip-path: inset(0 100% 0 0% round 999px); }
  6% { clip-path: inset(0 81% 0 1% round 999px); }
  12% { clip-path: inset(0 64% 0 4% round 999px); }
  18% { clip-path: inset(0 49% 0 9% round 999px); }
  24% { clip-path: inset(0 36% 0 16% round 999px); }
  30% { clip-path: inset(0 25% 0 25% round 999px); }
  36% { clip-path: inset(0 16% 0 36% round 999px); }
  42% { clip-path: inset(0 9% 0 49% round 999px); }
  48% { clip-path: inset(0 4% 0 64% round 999px); }
  54% { clip-path: inset(0 1% 0 81% round 999px); }
  60%, 100% { clip-path: inset(0 0% 0 100% round 999px); }
}
@keyframes creatorStatusPulse { 0% { box-shadow: 0 0 0 0 rgb(15 159 143 / 35%); } 70%, 100% { box-shadow: 0 0 0 6px rgb(15 159 143 / 0%); } }
@keyframes creatorSegmentSweep { to { transform: translateX(100%); } }
@keyframes creatorProgressShort {
  0%, 60% { clip-path: inset(0 100% 0 0% round 999px); }
  65% { clip-path: inset(0 82.03% 0 7.031% round 999px); }
  70% { clip-path: inset(0 65.62% 0 15.62% round 999px); }
  75% { clip-path: inset(0 50.78% 0 25.78% round 999px); }
  80% { clip-path: inset(0 37.5% 0 37.5% round 999px); }
  85% { clip-path: inset(0 25.78% 0 50.78% round 999px); }
  90% { clip-path: inset(0 15.62% 0 65.62% round 999px); }
  95% { clip-path: inset(0 7.031% 0 82.03% round 999px); }
  100% { clip-path: inset(0 0% 0 100% round 999px); }
}

:global(.dark) .creator-studio { --creator-line: #30413f; color: #e7efed; }
:global(.dark) .studio-toolbar,
:global(.dark) .history-panel,
:global(.dark) .settings-panel { background: #111b1a; }
:global(.dark) .history-panel.is-drawer { color: #e7efed; }
:global(.dark) .history-drawer-toggle { border-color: #344744; color: #c3cfcc; background: #172321; box-shadow: none; }
:global(.dark) .history-drawer-toggle[aria-expanded="true"] { border-color: #39776d; color: #83ddd0; background: #172321; }
:global(.dark) .history-drawer-toggle-live { border-color: #172321; }
:global(.dark) .studio-grid { background: #0d1716; }
:global(.dark) .studio-title,
:global(.dark) .history-heading h2,
:global(.dark) .settings-heading h2,
:global(.dark) .inspiration-intro h2,
:global(.dark) .generation-state h2,
:global(.dark) .result-heading h2 { color: #eef5f4; }
:global(.dark) .mode-switch,
:global(.dark) .history-tabs,
:global(.dark) .capability-switch { border-color: #344744; background: #192725; }
:global(.dark) .mode-option.active,
:global(.dark) .history-tabs button.active,
:global(.dark) .capability-switch button.active { border-color: #3b514d; background: #263532; }
:global(.dark) .capability-switch button:disabled { color: #4f625f; }
:global(.dark) .mode-option-icon { border-color: #3c504d; color: #aab9b6; background: #1b2927; }
:global(.dark) .mode-option-image.active .mode-option-icon { border-color: #39776d; color: #71d9c9; background: #18332f; }
:global(.dark) .mode-option-video.active .mode-option-icon { border-color: #355f9e; color: #75a7ff; background: #172b49; }
:global(.dark) .ready-status { border-color: #26745d; color: #71dab5; background: #142b24; }
:global(.dark) .connection-action { color: #b8c7c4; }
:global(.dark) .connection-action:hover { color: #7de0d1; background: #1b312e; box-shadow: inset 0 0 0 1px #35514c; }
:global(.dark) .icon-action,
:global(.dark) .collapse-action,
:global(.dark) .studio-input,
:global(.dark) .stepper,
:global(.dark) .stepper button { border-color: #354643; color: #c3cfcc; background: #172321; }
:global(.dark) .stepper-value { color: #c3cfcc; }
:global(.dark) .stepper-value:hover,
:global(.dark) .stepper-value:focus-within { background: #1d2b29; }
:global(.dark) .playground-history-reopen-button { border-color: #344744; color: #c3cfcc; background: #172321; box-shadow: none; }
:global(.dark) .history-entry-icon { color: #71d9c9; background: #18332f; }
:global(.dark) .studio-input { color: #ecf3f2; }
:global(.dark) .image-size-mode-tabs,
:global(.dark) .image-size-result { background: #172321; }
:global(.dark) .image-size-mode-tabs button.active,
:global(.dark) .image-resolution-grid button,
:global(.dark) .image-ratio-grid button,
:global(.dark) .custom-ratio-command,
:global(.dark) .image-custom-size input { border-color: #354643; color: #d7e1df; background: #14211f; }
:global(.dark) .image-size-result strong,
:global(.dark) .image-size-auto-panel strong { color: #e8f1ef; }
:global(.dark) .image-custom-size > p { border-color: #334642; color: #a9b8b5; background: #172321; }
:global(.dark) .history-item:hover,
:global(.dark) .advanced-grid,
:global(.dark) .toggle-row { background: #172321; }
:global(.dark) .history-item { --history-item-bg: #131f1d; border-color: #354643; background: #131f1d; box-shadow: none; }
:global(.dark) .history-item:hover { --history-item-bg: #172321; }
:global(.dark) .history-item.active { --history-item-bg: #17322e; border-color: #357f74; background: #17322e; }
:global(.dark) .history-item.generating { border-color: #357f74; }
:global(.dark) .generation-frame { border-color: #2f4d48; background-image: linear-gradient(110deg, #16302c 30%, #1f3c37 50%, #16302c 70%); box-shadow: 0 14px 34px rgb(0 0 0 / 28%); }
:global(.dark) .generation-frame.is-queued { border-color: #33504b; background: rgb(255 255 255 / 3%); }
:global(.dark) .generation-frame.is-failed { border-color: #5a3430; background: rgb(216 75 75 / 8%); }
:global(.dark) .generation-frame-failed { color: #ff9a90; }
:global(.dark) .partial-result-notice { border-color: #5b4724; color: #f0c06a; background: #2a2416; }
:global(.dark) .partial-result-notice strong { color: #f6d39a; }
:global(.dark) .partial-result-notice p { color: #c9ad7f; }
:global(.dark) .generation-panel { border-color: #2a3a38; background: #142220; box-shadow: none; }
:global(.dark) .generation-state .generation-heading-copy h2 { color: #eef5f4; }
:global(.dark) .generation-prompt { color: #e2ebe9; }
:global(.dark) .result-tags.generation-tags li { border-color: #2c3d3b; color: #a5b8b4; background: transparent; }
:global(.dark) .result-tags.generation-tags li:first-child { border-color: #2b4a45; color: #79dfd0; background: #17302c; }
:global(.dark) .generation-segment { background: #213532; }
:global(.dark) .generation-segment.is-done { background: linear-gradient(90deg, #2bc4ac, #79dfd0); }
:global(.dark) .generation-segment.is-failed { background: #5a2f2b; }
:global(.dark) .generation-status-dot { background: #79dfd0; }
:global(.dark) .generation-heading-copy p,
:global(.dark) .generation-elapsed { color: #93a7a3; }
:global(.dark) .generation-elapsed strong { color: #e6efed; }
:global(.dark) .generation-done-count { color: #93a7a3; }
:global(.dark) .generation-new-creation { border-color: #344744; color: #c5d6d3; background: #192725; }
:global(.dark) .generation-new-creation:hover { border-color: #79dfd0; color: #79dfd0; background: #1d2f2c; }
:global(.dark) .progress-track { background: #213532; }
:global(.dark) .generation-frame-ring { color: #79dfd0; background: rgb(23 50 46 / 80%); box-shadow: 0 10px 30px rgb(0 0 0 / 30%), inset 0 0 0 1px rgb(255 255 255 / 6%); }
:global(.dark) .generation-frame.is-current { border-color: #2f4d48; background: #152926; }
:global(.dark) .result-description p.result-prompt { color: #93a7a3; }
:global(.dark) .history-generating { background-image: linear-gradient(110deg, #1a2a27 30%, #223632 50%, #1a2a27 70%); }
:global(.dark) .history-generating.has-preview { background: rgb(19 31 29 / 55%); }
:global(.dark) .history-generating-ring { color: #79dfd0; background: #17322e; box-shadow: none; }
:global(.dark) .history-generating-ring::before { border-color: #2c4a45; border-top-color: #79dfd0; }
:global(.dark) .history-item-actions button:hover { background: #223431; }
:global(.dark) .history-item-actions .history-delete:hover { color: #ff8a8a; background: #3a2424; }
:global(.dark) .history-copy strong,
:global(.dark) .field-block > label,
:global(.dark) .field-row label,
:global(.dark) .toggle-row strong { color: #d6e0de; }
:global(.dark) .prompt-tool,
:global(.dark) .upload-zone,
:global(.dark) .advanced-grid,
:global(.dark) .toggle-row,
:global(.dark) .video-duration-estimate,
:global(.dark) .result-card { border-color: #334642; background: #14211f; }
:global(.dark) .professional-workspace,
:global(.dark) .result-stat-grid article,
:global(.dark) .sequence-shot { border-color: #334642; background: #14211f; }
:global(.dark) .sequence-header h2,
:global(.dark) .sequence-header dd,
:global(.dark) .sequence-shot-prompt,
:global(.dark) .result-stat-grid strong,
:global(.dark) .result-prompt-cell .full-prompt { color: #dbe7e5; }
:global(.dark) .result-stat-grid { border-color: #334642; background: #14211f; }
:global(.dark) .result-stat-grid article { box-shadow: 0 0 0 1px #334642; }
:global(.dark) .result-actions { border-top-color: #2a3b38; }
:global(.dark) .result-tags li { color: #a5bdb6; background: #1d302c; }
:global(.dark) .sequence-header h2 span { border-color: #347a6f; color: #83ddd0; background: #15302c; }
:global(.dark) .prompt-tool { background: #14211f; }
:global(.dark) .prompt-tool > header { border-color: #334642; }
:global(.dark) .prompt-tool header strong,
:global(.dark) .prompt-template-grid strong { color: #d6e0de; }
:global(.dark) .prompt-template-grid button,
:global(.dark) .prompt-page-actions button { border-color: #354643; color: #c3cfcc; background: #172321; }
:global(.dark) .quick-templates-label { color: #8a9c99; }
:global(.dark) .quick-templates-label::after { background: #2a3b38; }
:global(.dark) .quick-templates button { border-color: #354643; background: #172321; }
:global(.dark) .quick-templates button strong { color: #d6e0de; }
:global(.dark) .quick-templates button small { color: #7f938f; }
:global(.dark) .quick-templates button:hover,
:global(.dark) .quick-templates button:focus-visible { border-color: #347a6f; background: #1b2b28; }
:global(.dark) .quick-templates button:hover strong,
:global(.dark) .quick-templates button:focus-visible strong { color: #83ddd0; }

@media (max-width: 1380px) {
  .studio-grid { grid-template-columns: 17rem minmax(390px, 1fr) 21rem; }
  .studio-grid.history-collapsed { grid-template-columns: minmax(390px, 1fr) 21rem; }
}

@media (max-width: 1120px) {
  .studio-grid,
  .studio-grid.history-collapsed { grid-template-columns: minmax(0, 1fr) 350px; }
  .history-panel:not(.is-drawer) { display: none; }
  .history-reopen { display: none; }
  .history-drawer-toggle { display: inline-flex; }
  /* Stretch to the mode switch's height so the two read as one row. */
  .toolbar-actions { align-self: stretch; }
  .history-drawer-toggle { align-self: stretch; }
  .studio-toolbar { grid-template-columns: 1fr auto; }
  .studio-title { display: none; }
  .mode-switch { justify-self: start; width: min(410px, 100%); }
}

@media (max-width: 800px) {
  /* Match the settings panel's 16px inline padding stacked above the canvas. */
  .creator-studio { --creator-workspace-gutter: 16px; --creator-workspace-width: calc(100% - 32px); height: auto; min-height: auto; overflow: visible; }
  .generation-stage { width: 100%; }
  .generation-stage.is-image { display: grid; width: 100%; grid-template-columns: repeat(var(--generation-mobile-columns, 1), minmax(0, 1fr)); }
  .generation-stage.is-image > .generation-frame:not(:only-child):last-child:nth-child(odd) { grid-column: 1 / -1; width: min(100%, calc((100% - 12px) / 2)); justify-self: center; }
  .generation-stage.is-image:has(> .generation-frame:only-child) { display: flex; }
  .generation-stage.is-image:has(> .generation-frame:only-child) > .generation-frame { width: auto; height: min(var(--generation-frame-height), 62vh); }
  .generation-state.is-video { flex: 0 0 auto; grid-template-rows: auto auto; }
  .generation-stage.is-video { grid-auto-rows: auto; justify-items: center; }
  .generation-frame { flex: 1 1 0; width: auto; max-width: var(--generation-frame-mobile-max); }
  .generation-stage.is-video .generation-frame { width: 100%; aspect-ratio: var(--generation-frame-aspect-ratio); }
  .generation-panel { width: 100%; padding: 18px 16px 16px; }
  .generation-panel .generation-body { gap: 14px; }
  .generation-heading { gap: 10px; }
  /* Compact button keeps the heading on one row so the subtitle has room. */
  .generation-heading .generation-new-creation { min-height: 34px; gap: 4px; padding: 0 12px; font-size: 12px; }
  /* The card no longer clips (overflow: visible for sticky), so round the toolbar to match it. */
  .studio-toolbar { position: sticky; z-index: 8; top: 64px; display: flex; gap: 8px; align-items: stretch; padding: 8px; border-radius: var(--creator-surface-radius) var(--creator-surface-radius) 0 0; transition: border-radius 160ms ease; }
  .studio-toolbar.is-stuck { border-radius: 0; }
  .mode-switch { flex: 0 1 360px; min-width: 0; width: min(360px, 100%); }
  .mode-option { gap: 6px; min-height: 38px; }
  .mode-option-icon { flex-basis: 28px; width: 28px; height: 28px; }
  /* Only the history entry stays; status and refresh live on wider layouts. */
  .toolbar-actions { display: flex; flex: none; align-items: center; }
  .toolbar-actions > :not(.history-drawer-toggle) { display: none; }
  /* Phones get a bottom sheet instead of the side drawer. */
  .history-panel.is-drawer {
    top: auto;
    right: 0;
    width: auto;
    height: min(80vh, 640px);
    height: min(80dvh, 640px);
    padding-bottom: env(safe-area-inset-bottom);
    border-right: 0;
    border-radius: 20px 20px 0 0;
    transform: translateY(100%);
  }
  .history-drawer-handle { display: block; flex: none; width: 40px; height: 4px; margin: 10px auto 0; border-radius: 999px; background: #cfd9d8; }
  .history-panel.is-drawer .history-heading { padding-top: 12px; }
  /* Same inset as the tabs above so the cards line up with them on both sides. */
  .history-panel.is-drawer .history-list { padding-inline: 16px; }
  .studio-grid,
  .studio-grid.history-collapsed { display: flex; flex: none; flex-direction: column; min-height: auto; overflow: visible; }
  .capability-switch { gap: 4px; padding: 4px; }
  .capability-switch button { min-height: 40px; font-size: 11px; }
  /* Show current results above the settings when there is an active creation. */
  /* Fallback only: revealSettingsOnMobile sets the measured toolbar offset inline. */
  /* Bottom of the unclipped card, so it carries the card's lower corners like the toolbar does the upper ones. */
  .settings-panel { order: 2; height: auto; border-top: 1px solid var(--creator-line); border-left: 0; border-radius: 0 0 var(--creator-surface-radius) var(--creator-surface-radius); scroll-margin-top: 136px; }
  /* Not a scroll container on mobile: with overscroll-behavior: contain it would swallow page swipes. */
  .settings-scroll { height: auto; max-height: none; overflow: visible; overscroll-behavior: auto; padding: 18px 16px 22px; scrollbar-gutter: auto; }
  /* Size to content: a fixed floor leaves a blank band above the settings when the result is short.
     The scroll margin clears the sticky site header (64px) and studio toolbar when scrolled into view. */
  .canvas-panel { order: 1; height: auto; min-height: 0; overflow: visible; scroll-margin-top: 136px; }
  /* New creations open directly on generation settings without an empty canvas gap. */
  .canvas-panel:has(> .inspiration-workspace) { display: none; }
  .professional-workspace { margin-top: 16px; padding: 13px; }
  .sequence-header { grid-template-columns: minmax(0, 1fr) 36px; }
  .sequence-header dl { display: none; }
  .sequence-track { grid-template-columns: minmax(0, 1fr); }
  .sequence-shot { width: 100%; }
  /* The stage follows each brief's height (measured in script) so short briefs leave no gap. */
  .brief-stage { height: var(--brief-stage-height, auto); transition: height 220ms ease; }
  .brief-body { --brief-body-pad-block: 20px; grid-template-columns: minmax(0, 1fr); height: auto; padding: var(--brief-body-pad-block) 24px; }
  .brief-summary { padding: 0 0 16px; border-right: 0; border-bottom: 1px solid #33423f; }
  .brief-summary h3 { margin: 12px 0 4px; font-size: 24px; }
  .brief-summary small { display: none; }
  .brief-copy { padding: 16px 0 0; }
  /* The margin plus the line's half-leading (~5px) matches the card padding below the button. */
  .brief-copy p { flex: 0 1 auto; margin: 10px 0 calc(var(--brief-body-pad-block) - 5px); }
  /* The scroller's bottom edge rarely lands on a line boundary; fade the cut line out while more text is below. */
  .brief-copy p.is-clipped {
    -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 1.8em), transparent);
    mask-image: linear-gradient(to bottom, #000 calc(100% - 1.8em), transparent);
  }
  .brief-copy button { align-self: stretch; justify-content: center; min-height: 44px; }
  .brief-topline button { width: 36px; height: 36px; }
  /* The topline already shows the position; avoid a second counter. */
  .brief-position { display: none; }
  .brief-navigation { min-height: 52px; }
  .quick-templates { margin-top: 18px; }
  .quick-templates-list { display: flex; gap: 8px; margin-inline: calc(-1 * var(--creator-workspace-gutter)); padding: 2px var(--creator-workspace-gutter) 4px; overflow-x: auto; scroll-padding-inline: var(--creator-workspace-gutter); scroll-snap-type: x proximity; scrollbar-width: none; overscroll-behavior-x: contain; }
  .quick-templates-list::-webkit-scrollbar { display: none; }
  .quick-templates-list button { flex: 0 0 auto; min-width: 124px; scroll-snap-align: start; }
  .result-grid { grid-template-columns: 1fr; }
  .result-heading-complete { align-items: flex-start; gap: 10px; }
  .result-heading-complete > .result-heading-title { flex: 1 1 100%; }
  .result-heading-actions { flex: 0 0 100%; flex-wrap: nowrap; gap: 6px; }
  .result-heading-actions .secondary-command,
  .result-heading-actions .icon-action { flex: 1 1 auto; min-width: 0; gap: 4px; padding-inline: 6px; font-size: 11px; }
  .complete-video-card > header { align-items: flex-start; flex-direction: column; gap: 10px; }
  .complete-video-card > footer { align-items: flex-start; flex-direction: column; }
  .result-media { height: clamp(280px, 62vh, 460px); }
  .result-media.landscape { height: auto; }
  .result-media.fitted { height: auto; max-height: clamp(280px, 62vh, 460px); }
}

@media (max-width: 480px) {
  .result-heading-actions { gap: 5px; }
  .result-heading-actions .secondary-command,
  .result-heading-actions .icon-action { gap: 2px; padding-inline: 2px; font-size: 10px; }
  .result-heading-actions svg { width: 14px; height: 14px; }
  .capability-switch button { min-height: 36px; font-size: 10px; }
  .mode-switch { flex-basis: 320px; width: min(320px, 100%); }
  .mode-option { min-height: 36px; }
  .mode-option span { font-size: 11px; }
  .mode-option-copy strong { font-size: 11px; }
  .history-entry-surface { gap: 7px; min-height: 44px; padding-right: 10px; }
  .history-entry-icon { flex-basis: 30px; width: 30px; height: 30px; }
  .history-entry-copy strong { font-size: 12px; }
  .two-column-fields,
  .advanced-grid { grid-template-columns: 1fr; }
  .video-params-result { flex-direction: column; align-items: flex-start; }
  .video-params-cost { text-align: left; }
  .image-ratio-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .image-size-mode-tabs button { padding: 0 5px; font-size: 11px; }
  .image-custom-size > div { grid-template-columns: 1fr; }
  .image-custom-size > div > span { display: none; }
  .image-size-cancel,
  .image-size-confirm { min-width: 0; flex: 1; }
  .toggle-row.wide { grid-column: auto; }
  .featured-brief { margin-top: 18px; }
  .brief-summary h3 { font-size: 22px; }
  .sequence-footer { align-items: flex-start; flex-direction: column; }
  .modal-backdrop { padding: 10px; }
}

@media (hover: none) {
  /* No hover on touch: keep delete reachable but quiet so it doesn't compete with the title. */
  .history-item-actions { opacity: .55; pointer-events: auto; }
  .history-item.active .history-item-actions { opacity: .8; }
}
.image-cost-preview { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 16px 0 8px; padding: 14px 2px 4px; border-top: 1px solid #e8eeed; }
.image-cost-copy { min-width: 0; }
.image-cost-label { color: #53647a; font-size: 12px; font-weight: 600; }
.image-cost-copy p { margin: 4px 0 0; color: #8b98aa; font-size: 11px; line-height: 1.5; }
.video-summary { margin-top: 16px; padding-top: 16px; border-top: 1px solid #e8eeed; }
.video-summary .video-cost-preview { margin-top: 8px; padding-top: 6px; border-top: 0; }
.video-duration-estimate { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0; padding: 0 13px; border: 1px solid #d4e3e0; border-radius: var(--creator-radius-large); background: #f8fcfb; }
.video-duration-estimate span { color: #65758a; font-size: 12px; font-weight: 700; }
.video-duration-estimate strong { margin-left: 5px; color: var(--creator-accent-strong); font-size: 14px; }
.video-duration-estimate small { overflow: hidden; color: #8c9bae; font-size: 10px; font-weight: 650; text-overflow: ellipsis; white-space: nowrap; }
.image-cost-total { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: flex-end; column-gap: 5px; row-gap: 2px; text-align: right; }
.image-cost-total strong { color: #243448; font-size: 21px; font-weight: 650; letter-spacing: -.6px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.image-cost-total > span { color: #97a3b2; font-size: 10px; font-weight: 500; letter-spacing: .3px; }
.image-cost-total.is-status strong { color: #8b98aa; font-size: 12px; font-weight: 500; letter-spacing: 0; }
.image-price-retry { margin-top: 4px; color: var(--creator-accent-strong); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; }
.image-tier-price { display: block; margin-top: 4px; font-size: 11px; font-weight: 500; }
:global(.dark) .image-cost-preview,
:global(.dark) .video-summary { border-color: #2c3e42; }
:global(.dark) .image-cost-label { color: #b6c3ce; }
:global(.dark) .image-cost-total strong { color: #e2ecef; }
:global(.dark) .image-cost-total.is-status strong { color: #8b98aa; }
</style>
