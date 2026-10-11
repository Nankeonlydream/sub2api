<template>
  <AppLayout>
    <section ref="studioElement" class="creator-studio card" aria-label="创作中心">
    <header class="studio-toolbar">
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
          <span class="playground-history-reopen-icon">
            <Icon name="inbox" size="sm" />
          </span>
          <span>历史记录</span>
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
      </div>
    </header>

    <nav v-if="activeGenerations.size" class="generation-tasks" aria-label="正在生成的任务">
      <span class="generation-tasks-label">生成中 {{ activeGenerations.size }}</span>
      <button
        v-for="task in activeGenerations.values()"
        :key="task.id"
        type="button"
        class="generation-task"
        :class="{ active: selectedWork?.id === task.id }"
        :aria-pressed="selectedWork?.id === task.id"
        :title="task.prompt"
        @click="selectGeneration(task.id)"
      >
        <span class="button-spinner"></span>
        <span>{{ task.prompt }}</span>
      </button>
    </nav>

    <div class="studio-grid" :class="{ 'history-collapsed': historyCollapsed }">
      <aside id="creator-history-panel" class="history-panel" aria-label="作品历史">
        <div class="history-heading">
          <div>
            <h2>{{ historyFilter === 'image' ? '图片历史' : '视频历史' }}</h2>
            <p>作品仅保存在当前浏览器</p>
          </div>
          <span class="history-count">{{ visibleHistory.length }}</span>
          <button type="button" class="collapse-action" title="收起作品历史" @click="historyCollapsed = true">
            <Icon name="chevronLeft" size="sm" />
          </button>
        </div>

        <div class="history-tabs">
          <button type="button" :class="{ active: historyFilter === 'image' }" @click="historyFilter = 'image'">
            <Icon name="grid" size="xs" /> 图片 {{ imageHistoryCount }}
          </button>
          <button type="button" :class="{ active: historyFilter === 'video' }" @click="historyFilter = 'video'">
            <Icon name="play" size="xs" /> 视频 {{ videoHistoryCount }}
          </button>
        </div>

        <div v-if="visibleHistory.length && !historyCollapsed" ref="historyListElement" class="history-list">
          <div v-if="historyPaddingTop" :style="{ height: `${historyPaddingTop}px` }" aria-hidden="true"></div>
          <article
            v-for="work in renderedHistory"
            :key="work.id"
            class="history-item"
            :class="{ active: selectedWork?.id === work.id }"
          >
            <button
              type="button"
              class="history-item-hitbox"
              :aria-label="`打开作品：${historyWorkTitle(work)}`"
              @click="selectWork(work)"
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
              <Icon v-else :name="work.type === 'image' ? 'sparkles' : 'play'" size="sm" />
              <span v-if="work.status === 'pending'" class="history-status pending"></span>
              <span v-else-if="work.status === 'failed'" class="history-status failed"></span>
            </span>
            <span class="history-copy">
              <strong>{{ historyWorkTitle(work) }}</strong>
              <small>{{ work.model }} · {{ work.aspectRatio || '自动' }} · {{ workResolutionLabel(work) }} · {{ formatHistoryTime(work.createdAt) }}</small>
            </span>
            <span class="history-item-actions">
              <button type="button" title="打开作品" aria-label="打开作品" @click.stop="selectWork(work)">
                <Icon name="arrowRight" size="xs" />
              </button>
              <button
                type="button"
                class="history-delete"
                :title="activeGenerations.has(work.id) ? '生成完成后可删除' : '删除作品'"
                aria-label="删除作品"
                :disabled="activeGenerations.has(work.id)"
                @click.stop="removeWork(work)"
              >
                <Icon name="x" size="xs" />
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

      <main class="canvas-panel">
        <div v-if="selectedGeneration" class="generation-state">
          <span class="generation-orbit"><Icon :name="generationMode === 'image' ? 'sparkles' : 'play'" size="lg" /></span>
          <h2>{{ generationMode === 'image' ? '正在绘制你的画面' : '正在制作你的视频' }}</h2>
          <p>{{ generationProgress }}</p>
          <div class="generation-metrics">
            <span>已用时</span>
            <strong>{{ generationElapsedLabel }}</strong>
            <strong v-if="generationMode === 'video' && generationPhase === 'generating' && generationHasExactProgress" class="generation-percent">{{ generationPercent }}%</strong>
          </div>
          <div
            class="progress-track"
            :class="{ indeterminate: !generationHasExactProgress }"
            role="progressbar"
            :aria-valuenow="generationHasExactProgress ? generationPercent : undefined"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span :style="generationHasExactProgress ? { width: `${generationPercent}%` } : undefined"></span>
          </div>
          <button type="button" class="new-creation-link generation-new-creation" @click="newCreation">
            <Icon name="plus" size="sm" />新建创作
          </button>
          <small class="generation-note">
            <span>生成期间请勿刷新或关闭页面</span>
          </small>
        </div>

        <div v-else-if="selectedWork" class="result-workspace">
          <div class="result-heading result-heading-complete">
            <div>
              <p class="eyebrow">{{ selectedWork.status === 'pending' ? '等待生成结果' : selectedWork.status === 'failed' ? '生成未完成' : '生成结果' }}</p>
              <h2>{{ selectedWork.status === 'failed' ? '这次没有完成' : '本次创作' }}</h2>
              <p>{{ resultMeta(selectedWork) }}</p>
            </div>
            <div class="result-heading-actions">
              <button type="button" class="icon-action danger" title="删除这条作品" aria-label="删除这条作品" @click="removeWork(selectedWork)">
                <Icon name="trash" size="sm" />
              </button>
              <span v-if="selectedWork.status === 'completed'" class="result-count-pill">
                {{ isMultiShotVideo(selectedWork) && selectedWork.outputs.length ? `完整成片 + ${selectedWork.outputs.length} 段` : `${resultOutputCount(selectedWork)} ${selectedWork.type === 'image' ? '张' : '段'}` }}
              </span>
              <button
                v-if="selectedWork.status === 'completed'"
                type="button"
                class="secondary-command"
                :disabled="Boolean(regeneratingWorkId)"
                @click="regenerateWork(selectedWork)"
              >{{ regeneratingWorkId === selectedWork.id ? '准备生成...' : '重新生成' }}</button>
              <button v-if="selectedWork.status === 'completed'" type="button" class="secondary-command primary-soft" @click="continueCreating">新建创作</button>
            </div>
          </div>

          <div v-if="selectedWork.status === 'failed'" class="result-error">
            <Icon name="exclamationTriangle" size="lg" />
            <strong>生成失败</strong>
            <p>{{ selectedWork.error || '请检查模型与参数后重试。' }}</p>
            <button type="button" class="secondary-command" @click="reuseWork(selectedWork)">带回参数重试</button>
          </div>

          <div
            v-if="selectedWork.status === 'completed' && selectedWork.type === 'video' && selectedWork.requestId && !selectedWork.outputs.length && loadingVideoWorkId === selectedWork.id"
            class="result-grid single video-loading-grid"
          >
            <article class="result-card video-loading-card">
              <div class="result-media video-loading-media" :style="resultMediaStyle(selectedWork)" role="status" aria-live="polite">
                <div class="video-loading-content">
                  <span class="video-loading-spinner"><Icon name="refresh" size="sm" /></span>
                  <strong>正在加载视频</strong>
                  <p>视频已生成，正在准备播放，请稍候。</p>
                </div>
              </div>
              <div class="result-actions video-loading-actions">
                <div class="result-description">
                  <strong>{{ isMultiShotVideo(selectedWork) ? '完整成片' : '视频结果' }}</strong>
                  <span>{{ selectedWork.model }} · {{ selectedWork.aspectRatio || '自动画幅' }} · {{ workResolutionLabel(selectedWork) }}</span>
                  <p>{{ resultDescription(selectedWork, 0) }}</p>
                </div>
              </div>
            </article>
          </div>

          <div
            v-else-if="selectedWork.status === 'completed' && selectedWork.type === 'video' && selectedWork.requestId && !selectedWork.outputs.length && selectedVideoHistoryFeedback && selectedVideoHistoryFeedback.tone === 'error'"
            class="result-error muted"
          >
            <Icon name="exclamationTriangle" size="lg" />
            <strong>视频加载失败</strong>
            <p>{{ selectedVideoHistoryFeedback.message }}</p>
            <button
              type="button"
              class="secondary-command primary-soft status-check-command"
              :disabled="checkingVideoHistory"
              @click="refreshVideoWork(selectedWork)"
            >
              <Icon name="refresh" size="xs" />
              {{ checkingVideoHistory ? '正在重试...' : '重新加载视频' }}
            </button>
          </div>

          <section v-if="selectedWork.status !== 'failed' && selectedWork.outputs.length && isMultiShotVideo(selectedWork)" class="complete-video-card">
            <header>
              <div>
                <p class="eyebrow">完整成片</p>
                <h3>{{ selectedWork.mergedOutput ? '所有镜头已按顺序合成' : '镜头素材已完成，等待合成完整视频' }}</h3>
                <p>{{ completeVideoDescription(selectedWork) }}</p>
              </div>
              <span>{{ selectedWork.outputs.length }} 个镜头 · {{ selectedWork.requestedDuration || 0 }} 秒</span>
            </header>
            <template v-if="selectedWork.mergedOutput">
              <CreatorVideoPlayer
                class="complete-video-frame"
                :style="resultMediaStyle(selectedWork)"
                media-class="complete-video-media"
                :src="selectedWork.mergedOutput"
                @error="handleVideoPlaybackError(selectedWork)"
                @loadedmetadata="handleVideoMetadata($event, selectedWork, 0, 'complete')"
              >
                <template #loading>
                  <div class="video-loading-overlay" role="status" aria-live="polite">
                    <span class="video-loading-spinner"><Icon name="refresh" size="sm" /></span>
                    <strong>正在加载视频</strong>
                    <p>正在准备完整成片，请稍候。</p>
                  </div>
                </template>
              </CreatorVideoPlayer>
              <footer>
                <div>
                  <strong>完整视频</strong>
                  <span>{{ selectedWork.model }} · {{ selectedWork.aspectRatio || '自动画幅' }} · {{ workResolutionLabel(selectedWork) }}</span>
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

          <div v-if="selectedWork.status !== 'failed' && selectedWork.outputs.length && isMultiShotVideo(selectedWork)" class="segment-heading">
            <div><p class="eyebrow">分段素材</p><h3>镜头素材</h3></div>
            <span>{{ selectedWork.outputs.length }} 段</span>
          </div>

          <div v-else-if="selectedWork.status !== 'failed' && selectedWork.outputs.length" class="result-grid" :class="{ single: selectedWork.outputs.length === 1 }">
            <article v-for="(output, index) in selectedWork.outputs" :key="`${selectedWork.id}-${index}`" class="result-card">
              <span v-if="selectedWork.outputs.length > 1" class="result-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <CreatorImage
                v-if="selectedWork.type === 'image'"
                class="result-media"
                :class="{ landscape: resultIsLandscape(selectedWork) }"
                :style="resultMediaStyle(selectedWork)"
                :src="output"
                :cache-key="`${selectedWork.id}:${selectedWork.updatedAt}:${index}`"
                :alt="`生成图片 ${index + 1}`"
                title="查看大图"
                @preview="previewUrl = output"
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
              >
                <template #loading>
                  <div class="video-loading-overlay" role="status" aria-live="polite">
                    <span class="video-loading-spinner"><Icon name="refresh" size="sm" /></span>
                    <strong>正在加载视频</strong>
                    <p>正在准备播放，请稍候。</p>
                  </div>
                </template>
              </CreatorVideoPlayer>
              <div class="result-actions">
                <div class="result-description">
                  <strong>{{ selectedWork.type === 'video' ? `镜头 ${index + 1}` : selectedWork.provider }}</strong>
                  <span>{{ selectedWork.model }} · {{ workAspectRatio(selectedWork, index) }} · {{ workResolutionLabel(selectedWork, index) }}</span>
                  <p>{{ resultDescription(selectedWork, index) }}</p>
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
              </div>
            </article>
          </div>

          <div v-if="selectedWork.status !== 'failed' && selectedWork.outputs.length && isMultiShotVideo(selectedWork)" class="result-grid result-segment-grid">
            <article v-for="(output, index) in selectedWork.outputs" :key="`${selectedWork.id}-segment-${index}`" class="result-card">
              <span v-if="selectedWork.outputs.length > 1" class="result-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <CreatorVideoPlayer
                class="video-result-frame"
                :style="resultMediaStyle(selectedWork, index)"
                media-class="result-media video result-segment-video"
                :media-style="resultMediaStyle(selectedWork, index)"
                :src="output"
                @error="handleVideoPlaybackError(selectedWork)"
                @loadedmetadata="handleVideoMetadata($event, selectedWork, index)"
              >
                <template #loading>
                  <div class="video-loading-overlay" role="status" aria-live="polite">
                    <span class="video-loading-spinner"><Icon name="refresh" size="sm" /></span>
                    <strong>正在加载视频</strong>
                    <p>正在准备播放，请稍候。</p>
                  </div>
                </template>
              </CreatorVideoPlayer>
              <div class="result-actions">
                <div class="result-description">
                  <strong>镜头 {{ index + 1 }}</strong>
                  <span>{{ shotDurationLabel(selectedWork, index) }} · {{ workAspectRatio(selectedWork, index) }} · {{ workResolutionLabel(selectedWork, index) }} · {{ shotGenerationMeta(selectedWork, index) }}</span>
                  <p>{{ resultDescription(selectedWork, index) }}</p>
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
              </div>
            </article>
          </div>

          <div v-if="selectedWork.status === 'pending' && !selectedWork.outputs.length" class="result-error muted">
            <Icon :name="checkingVideoHistory ? 'refresh' : 'clock'" size="lg" :class="{ 'status-check-icon': checkingVideoHistory }" />
            <strong>{{ selectedWork.type === 'image' ? '正在等待图片结果' : checkingVideoHistory ? '正在检查任务状态' : '任务仍在处理中' }}</strong>
            <p>{{ selectedWork.type === 'image' ? '如果任务仍在其他页面生成，请保留该页面，结果保存后会自动同步到这里。若生成页面已关闭或刷新，可以带回参数重新创作。' : checkingVideoHistory ? '正在向视频服务查询最新进度，请稍候。' : '任务 ID 已保存在本地，可随时重新检查状态。' }}</p>
            <div v-if="selectedWork.type === 'image'" class="pending-image-actions">
              <button type="button" class="secondary-command primary-soft" @click="syncHistory">刷新生成结果</button>
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
              {{ checkingVideoHistory ? '正在检查...' : '检查任务状态' }}
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

          <section v-if="shouldShowResultParameters(selectedWork)" class="result-parameters" aria-label="作品参数">
            <div class="result-stat-grid">
              <article><span>完成耗时</span><strong>{{ formatCompletionDuration(selectedWork) }}</strong></article>
              <article><span>生成时间</span><strong>{{ formatResultTime(selectedWork.completedAt || selectedWork.updatedAt) }}</strong></article>
              <article><span>参考图</span><strong>{{ selectedWork.referenceCount || 0 }} 张</strong></article>
              <article><span>生成数量</span><strong>{{ resultOutputCount(selectedWork) }} {{ selectedWork.type === 'image' ? '张' : '段' }}</strong></article>
              <article><span>版本</span><strong>{{ selectedWork.version || 'v1' }}</strong></article>
              <article><span>来源</span><strong>{{ selectedWork.source || '初版作品' }}</strong></article>
            </div>
            <details class="result-parameter-details">
              <summary>
                <span>查看完整提示词与参数</span>
                <Icon name="chevronDown" size="xs" />
              </summary>
              <div>
                <span>模型与参数</span>
                <p>{{ detailedResultMeta(selectedWork) }}</p>
              </div>
              <div>
                <span>完整提示词</span>
                <p class="full-prompt">{{ fullPromptText(selectedWork) }}</p>
              </div>
            </details>
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
                    <button type="button" title="向上移动镜头" :disabled="index === 0" @click="moveShot(index, -1)"><Icon name="chevronUp" size="xs" /></button>
                    <button type="button" title="向下移动镜头" :disabled="index === videoShots.length - 1" @click="moveShot(index, 1)"><Icon name="chevronDown" size="xs" /></button>
                    <button type="button" title="删除镜头" :disabled="videoShots.length === 1 || processingReferenceImages" @click="removeShot(index)"><Icon name="x" size="xs" /></button>
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
            <div class="brief-stage">
              <Transition name="brief-slide" mode="out-in">
                <div :key="`${studioMode}-${activeTemplateIndex}`" class="brief-body">
                  <div class="brief-summary">
                    <span>{{ activeTemplate.tag }}</span>
                    <h3>{{ activeTemplate.title }}</h3>
                    <p>{{ activeTemplate.subtitle }}</p>
                    <small>画面提案 · {{ activeTemplate.prompt.length }} 字</small>
                  </div>
                  <div class="brief-copy">
                    <small>CREATIVE BRIEF</small>
                    <p>{{ activeTemplate.prompt }}</p>
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
            <span>其他企划</span>
            <button v-for="template in activeTemplates.slice(0, 10)" :key="template.title" type="button" @click="useTemplate(template)">
              <span>{{ template.title }}</span> <Icon name="arrowRight" size="xs" />
            </button>
          </div>
        </div>

        <div class="canvas-footnote"><Icon name="shield" size="xs" /> 当前请求使用你的 Sub2API Key</div>
      </main>

      <aside class="settings-panel" aria-label="生成设置">
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
              <span class="online-dot" aria-hidden="true"></span>
            </button>
          </div>

          <div v-else class="video-capability-card" aria-label="当前视频生成能力">
            <span class="video-capability-icon"><Icon name="playOutline" size="sm" :stroke-width="1.7" /></span>
            <div>
              <strong>Grok 生视频</strong>
              <small>使用独立的视频分组和用户 Key</small>
            </div>
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
              <option v-else-if="referenceVideoModelUnavailable" value="">没有可用的 1.5 视频模型</option>
              <option v-else-if="!selectableModelOptions.length" value="">请先创建 Key</option>
              <option v-for="model in selectableModelOptions" :key="model" :value="model">{{ model }}</option>
            </select>
            <small v-if="referenceVideoModelUnavailable" class="model-compatibility-error">当前分组没有 Grok Imagine Video 1.5，无法使用参考图生视频</small>
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
            <small>{{ studioMode === 'image' ? '描述主体、场景、风格和光线' : professionalVideo ? `当前为专业工作区 · 镜头 ${selectedShotIndex + 1}` : '描述动作、镜头、节奏和环境' }}</small>
            <textarea
              id="creator-prompt"
              v-model="editorPrompt"
              class="studio-input prompt-input"
              :maxlength="promptLimit"
              :placeholder="promptPlaceholder"
            ></textarea>
          </div>

          <div v-if="studioMode === 'video'" class="field-block">
            <label for="video-generation-method">生成方式</label>
            <select id="video-generation-method" v-model="activeVideoGenerationMethod" class="studio-input" :disabled="processingReferenceImages">
              <option value="text">文生视频 · 只用提示词</option>
              <option value="image">图生视频 · 1 张源图</option>
              <option value="reference">参考图生视频 · 最多 7 张</option>
            </select>
          </div>

          <div v-if="referenceFieldVisible" class="field-block reference-field">
            <div class="field-row">
              <div><label>{{ referenceFieldLabel }}</label><small>{{ referenceHint }}</small></div>
              <button type="button" class="inline-command" :disabled="processingReferenceImages" @click="openFilePicker"><Icon name="upload" size="sm" /> 添加</button>
            </div>
            <input ref="fileInput" type="file" class="sr-only" accept="image/png,image/jpeg,image/webp" :multiple="maxReferenceImages > 1" :disabled="processingReferenceImages" @change="handleFileInput" />
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
                </select>
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
            <div class="two-column-fields">
              <div class="field-block">
                <label for="video-aspect">视频比例</label>
                <select id="video-aspect" v-model="activeVideoAspectRatio" class="studio-input">
                  <option value="1:1">1:1 方形</option>
                  <option value="16:9">16:9 横屏</option>
                  <option value="9:16">9:16 竖屏</option>
                  <option value="4:3">4:3 横向</option>
                  <option value="3:4">3:4 竖向</option>
                  <option value="3:2">3:2 横向</option>
                  <option value="2:3">2:3 竖向</option>
                </select>
              </div>
              <div class="field-block">
                <label for="video-resolution">清晰度</label>
                <select id="video-resolution" v-model="activeVideoResolution" class="studio-input">
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                  <option v-if="videoSupports1080p" value="1080p">1080p</option>
                </select>
              </div>
            </div>

            <div class="field-block">
              <label>{{ professionalVideo ? `镜头 ${selectedShotIndex + 1} 时长` : '视频时长' }}</label>
              <div class="stepper video-control-row">
                <button type="button" title="减少时长" :disabled="configuredVideoDuration <= 1" @click="adjustVideoDuration(-1)"><Icon name="minus" size="sm" /></button>
                <strong>{{ configuredVideoDuration }} 秒</strong>
                <button type="button" title="增加时长" :disabled="configuredVideoDuration >= 15" @click="adjustVideoDuration(1)"><Icon name="plus" size="sm" /></button>
              </div>
            </div>

            <div class="video-duration-estimate video-control-row" aria-label="预计总时长">
              <span>预计总时长 <strong>{{ estimatedVideoDuration }} 秒</strong></span>
              <small>{{ estimatedVideoMode }}</small>
            </div>

            <label class="toggle-row professional-toggle video-control-row">
              <span class="professional-toggle-icon"><Icon name="grid" size="sm" /></span>
              <span class="professional-toggle-copy"><strong>{{ professionalVideo ? '收起专业工作区' : '展开专业工作区' }}</strong><small>主画布展示镜头序列，选中后在右侧编辑</small></span>
              <span class="professional-toggle-hint" title="镜头、排序、逐镜头参考与重试">镜头、排序、逐镜头参考与重试</span>
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

          <div v-if="studioMode === 'video'" class="image-cost-preview video-cost-preview" aria-live="polite" aria-label="视频生成费用预估">
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

          <button type="button" class="generate-button" :disabled="!canGenerate" @click="startGeneration">
            <Icon v-if="!selectedGeneration" name="sparkles" size="sm" />
            <span v-else class="button-spinner"></span>
            {{ selectedGeneration ? '正在生成...' : '开始生成' }}
          </button>
          <p v-if="professionalVideoReferenceError" class="generation-requirement">{{ professionalVideoReferenceError }}</p>
        </div>
      </aside>
    </div>

    <div v-if="previewUrl" class="modal-backdrop image-preview" role="presentation" @click="previewUrl = ''">
      <button type="button" class="preview-close" title="关闭预览" @click="previewUrl = ''"><Icon name="x" size="sm" /></button>
      <CreatorImage class="image-preview-content" :src="previewUrl" :cache-key="previewImageCacheKey" alt="生成图片预览" preview />
    </div>

    <BaseDialog
      :show="imageSizeDialogOpen"
      title="设置图像尺寸"
      width="normal"
      appearance="soft"
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
    </section>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, reactive, nextTick, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { observeElementRect, useVirtualizer } from '@tanstack/vue-virtual'
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
  getCreatorImagePricing,
  getCreatorVideoPricing,
  type CreatorVideoPricing,
  type CreatorImagePricing,
  getCreatorVideoContent,
  getCreatorVideoStatus,
  listCreatorModels,
} from '@/api/creator'
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
import { useAppStore } from '@/stores/app'
import type { ApiKey, Group } from '@/types'
import { formatScaled } from '@/utils/pricing'

type StudioMode = 'image' | 'video'
type ImageCapability = 'grok' | 'image2' | 'banner'
type GenerationPhase = 'submitting' | 'generating'
type ImageSizeMode = 'auto' | 'ratio' | 'custom'
type VideoGenerationMethod = 'text' | 'image' | 'reference'

const MAX_REFERENCE_IMAGE_SIZE_MB = 10
const MAX_REFERENCE_IMAGE_SIZE_BYTES = MAX_REFERENCE_IMAGE_SIZE_MB * 1024 * 1024
const VIDEO_SUBMISSION_RETRY_DELAYS_MS = [2000, 5000] as const

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
    generationMethod: VideoGenerationMethod
    referenceFiles: File[]
  }>
}

const imageTemplates: PromptTemplate[] = [
  { title: '雾港早餐', tag: '生活摄影', subtitle: '海风吹进清晨的餐桌', prompt: '清晨海港旁的小餐馆，一张旧木桌上摆着热咖啡、黄油吐司和半颗水煮蛋，窗外渔船隐在薄雾中，窗边侧光照亮陶杯边缘与轻柔蒸汽。平视近景，灰蓝与奶油白色调，真实食物纹理，安静自然的胶片摄影。' },
  { title: '竹影茶席', tag: '东方美学', subtitle: '一盏清茶与流动的竹影', prompt: '竹林旁的现代茶室，浅色石台上摆一只青瓷茶盏与细长竹匙，清茶透出淡金色，竹叶影子落在米白墙面。一位穿亚麻衣服的茶人只露出斟茶的手，斜侧构图，大面积留白，柔和午后光，克制精致的东方生活摄影。' },
  { title: '云端车站', tag: '奇幻建筑', subtitle: '在云海之上等一班列车', prompt: '一座悬在云海上方的山间铁路车站，拱形木梁与磨砂玻璃顶棚围出宽阔站台，一列墨绿色列车停靠在边缘，两位旅人提着行李等待。晨光穿过薄云，远山若隐若现，广角透视，以人物体现尺度，写实建筑概念图。' },
  { title: '青柠气泡', tag: '饮品广告', subtitle: '冷凝水珠里的夏日清爽', prompt: '一杯透明青柠气泡水放在浅绿色亚克力台上，杯中有薄切青柠与棱角分明的冰块，细小气泡沿杯壁上升，旁边放两片薄荷叶。右侧逆光穿过液体形成清亮折射，低机位产品特写，背景干净，左上留白，商业饮品摄影。' },
  { title: '风衣来信', tag: '时尚人像', subtitle: '海边长廊上的一阵风', prompt: '一位成年女性穿深蓝长风衣站在海边白色长廊，手握一封米白信件，海风轻轻掀起衣摆，侧脸望向画面外。重复的拱门形成纵深，阴天散射光，自然皮肤纹理，人物偏右，低饱和蓝白配色，时尚杂志编辑摄影。' },
  { title: '纸上花园', tag: '纸艺插画', subtitle: '层叠纸片构成一座春天', prompt: '用彩色纸张搭建一座微缩花园，珊瑚粉花朵、鼠尾草绿叶片与奶油白台阶层层交叠，一只小纸鸟停在枝头。斜俯视构图，真实裁切边缘与纸张纤维，柔光制造细腻层次阴影，手工纸雕插画，无文字，背景简洁。' },
  { title: '沙漠旅店', tag: '空间设计', subtitle: '弧形土墙中的清凉庭院', prompt: '沙漠中的精品旅店庭院，夯土弧墙围着一池浅水，细长棕榈树投下清晰阴影，石凳上放一条白色织物，远处沙丘从圆形门洞中显露。正面轴线构图，午后硬光，赭石与淡蓝配色，强调粗糙土墙和水面质感，建筑摄影。' },
  { title: '莓果蛋糕', tag: '美食静物', subtitle: '奶油与鲜果的细腻层次', prompt: '一块切开的莓果奶油蛋糕置于哑光白瓷盘，蛋糕断面层次清晰，顶端点缀覆盆子和一片薄荷叶，桌面散落少量糖粉。淡粉背景，窗边柔和侧光，近距离三分之二视角，真实湿润果肉与轻盈奶油纹理，高端甜点摄影。' },
  { title: '星尘香水', tag: '产品广告', subtitle: '深色玻璃里的微光', prompt: '一只烟灰色方形香水瓶立在深色石台上，瓶盖为拉丝银色金属，背后悬着一层细薄半透明织物，点状光源在玻璃中形成星尘般折射。中央构图，暗背景与精准轮廓光，瓶身不含标签，奢华但克制的产品摄影。' },
  { title: '雪夜邮亭', tag: '电影场景', subtitle: '风雪之中的一盏橙灯', prompt: '雪夜山路旁的一间小邮亭，木窗透出温暖橙光，门前停着一辆覆雪自行车，邮差背着帆布包刚走到台阶前。远处松林融入深蓝夜色，斜向飘雪被门灯照亮，中远景构图，写实电影美术，冷暖对比，故事感含蓄。' },
  { title: '雨城电车', tag: '城市摄影', subtitle: '湿润街道上的复古绿意', prompt: '雨后的老城街道，一辆墨绿色复古电车穿过石铺路面，咖啡馆窗灯在积水里形成金色倒影，前景一把透明雨伞轻微虚化。街道斜向延伸，蓝调时刻，真实潮湿材质，轻微胶片颗粒，纪实街头摄影。' },
  { title: '潮汐书房', tag: '室内设计', subtitle: '让海的节奏进入阅读空间', prompt: '面向海湾的现代书房，低矮橡木书架沿弧形墙面延伸，中央一张亚麻阅读椅和落地灯，大窗外海浪拍打礁石。清晨柔光均匀铺进室内，平视广角，原木与浅灰色调，真实织物和木纹，宁静的室内建筑摄影。' },
  { title: '橘猫值班', tag: '动物肖像', subtitle: '书店柜台的小小店长', prompt: '一只胖橘猫趴在独立书店的收银台上，前爪搭着一本翻开的书，身后是排列整齐的旧书和小台灯，旁边摆一杯未喝完的茶。低机位近景，猫眼与胡须清晰，背景柔和虚化，温暖自然光，幽默而真实的宠物摄影。' },
  { title: '山野露营', tag: '户外旅行', subtitle: '草甸、晨雾与刚沸腾的水', prompt: '高山草甸上的小型露营地，一顶米黄色帐篷面向层叠山谷，前景折叠桌上放着冒热气的金属水壶和两只杯子，一位旅人背对镜头看日出。晨雾在山间流动，广角构图，真实户外装备，清新自然的旅行摄影。' },
  { title: '荷塘夏梦', tag: '国风插画', subtitle: '一叶小舟穿过青绿荷影', prompt: '一幅青绿工笔与现代插画结合的荷塘画面，淡粉荷花从大叶片间探出，一叶小舟泊在画面下方，舟上放着竹篮与白色纱帽。俯视构图，细腻叶脉与宣纸肌理，青绿、浅粉、米白配色，留白形成水面，无题字。' },
  { title: '玻璃果园', tag: '超现实静物', subtitle: '透明果实与真实枝叶', prompt: '一枝带绿叶的柑橘枝条悬在淡蓝背景前，枝上的果实由透明玻璃构成，内部封存金色果肉与气泡，真实绿叶与玻璃形成材质反差。侧逆光，微距特写，折射精确自然，构图轻盈，超现实商业摄影。' },
  { title: '金属蝴蝶', tag: '珠宝设计', subtitle: '轻盈翅翼与精密银丝', prompt: '一枚蝴蝶形银质胸针置于深灰丝绒上，翅翼由细密金属丝与浅蓝半透明珐琅组成，关节和扣针结构精致真实。斜侧微距，窄条柔光勾勒金属边缘，背景暗而干净，冷银与蓝色配色，珠宝广告摄影。' },
  { title: '旧城花铺', tag: '人文纪实', subtitle: '清晨开门时的第一束花', prompt: '清晨旧城的一间花铺，一位成年店主蹲在门边整理陶桶里的鲜花，卷帘门刚升起，地上有湿润水迹和修剪下的枝叶。自然平视构图，柔和天光，真实衣料与花瓣细节，淡绿与暖砖色，安静有温度的纪实摄影。' },
  { title: '熔岩实验', tag: '抽象艺术', subtitle: '炽热曲线与冷静的留白', prompt: '一张抽象艺术画面，炽橙色半透明流体在黑色玄武岩纹理上形成弯曲河道，局部混入金属银色细线，周围保留大片炭灰空间。俯视构图，真实流体边缘与岩石孔洞，强烈冷暖对比，现代艺术印刷质感，无文字。' },
  { title: '岛屿灯塔', tag: '自然风光', subtitle: '风暴之后的第一道晴光', prompt: '一座白色灯塔立在孤岛玄武岩悬崖上，风暴刚结束，乌云裂开一道光照亮灯塔和海面，浪花在礁石边形成白色纹理。远景长焦构图，灯塔位于右侧三分线，灰蓝海水与金色天光，真实壮阔的风光摄影。' },
  { title: '木星菜园', tag: '科幻日常', subtitle: '异星基地里的一片绿色', prompt: '木星卫星基地的密闭菜园，成排绿叶蔬菜生长在白色栽培架上，一位植物学家检查叶片，舷窗外巨大的木星与冰原清晰可见。广角室内构图，真实航天结构，柔和栽培灯与冷色窗光，硬科幻电影场景。' },
  { title: '珊瑚剧院', tag: '幻想空间', subtitle: '在海底听一场无声演出', prompt: '浅海中的圆形剧院，珊瑚形立柱支撑透明穹顶，珍珠色座椅环绕中央舞台，舞台上只有一架白色钢琴，鱼群游过穹顶外。俯斜广角，海面光束形成水纹，浅蓝与柔粉色调，精致写实的幻想建筑设计。' },
  { title: '丝绸山峦', tag: '材质艺术', subtitle: '织物褶皱里的辽阔地形', prompt: '一大片青灰色丝绸被塑造成起伏山峦，金色细线沿褶皱延伸如山间小径，画面中央放一个极小的白色旅人模型体现尺度。低机位微距，柔和侧光凸显织物光泽，抽象地景与真实材质结合，简洁高级的艺术静物。' },
  { title: '蓝调爵士', tag: '舞台摄影', subtitle: '烟蓝背景中的黄铜光泽', prompt: '小型爵士俱乐部里，一位成年萨克斯演奏者站在舞台边，深色衬衫与黄铜乐器形成对比，后方鼓组只露出轮廓。侧面中近景，蓝色环境光与暖色聚光交叠，真实皮肤与金属细节，细腻胶片颗粒，现场音乐摄影。' },
  { title: '蘑菇旅馆', tag: '微缩童话', subtitle: '雨后的林间小小旅途', prompt: '苔藓森林中的微缩蘑菇旅馆，浅棕菌盖覆盖木质阳台，门口一只背小包的刺猬正抖落雨水，窗内透出暖光，石阶旁长着小蕨叶。低机位微距，露珠清晰，毛毡角色与木质模型，手工定格动画质感。' },
  { title: '未来单车', tag: '工业设计', subtitle: '轻量结构与城市通勤美学', prompt: '一辆未来城市通勤自行车放在浅灰摄影棚中，哑光钛金属车架、隐藏走线、窄轮胎和一体化车灯，结构合理可制造。完整侧面视图，柔和棚拍光，地面有轻微阴影，精确材质细节，简洁工业产品设计效果图。' },
  { title: '陶器家族', tag: '器物静物', subtitle: '手工釉色里的温柔差异', prompt: '五件大小不同的手工陶器排列在浅色石桌上，包括细口瓶、矮罐与茶碗，釉色从奶油白过渡到鼠尾草绿，表面保留细小颗粒与自然流釉。正面构图，柔和窗光，背景纯净，器物之间留有呼吸感，生活品牌摄影。' },
  { title: '春日骑楼', tag: '建筑摄影', subtitle: '旧街立面与盛开的三角梅', prompt: '南方老街的骑楼立面，奶黄色墙面、墨绿木窗与半圆拱廊，一株盛开的紫红三角梅从阳台垂落，楼下一位居民骑车经过。正面略仰视，清晨光线，真实旧墙痕迹，色彩明快而不过饱和，城市建筑摄影。' },
  { title: '远山咖啡', tag: '品牌场景', subtitle: '把山林装进一杯咖啡', prompt: '一袋无文字的米白咖啡包装与陶杯摆在深色木桌上，包装有简洁山峦压纹，背景透过落地窗看到晨雾中的松林。产品位于左侧，右侧留出干净背景，暖色侧光，真实纸张与咖啡油脂质感，精品咖啡品牌摄影。' },
  { title: '风筝海岸', tag: '旅行插画', subtitle: '海风牵起一片明亮颜色', prompt: '海边草坡上，一位穿黄色外套的旅人放飞红色风筝，弯曲风筝线引向浅蓝天空，远处白色浪花与小帆船点缀海面。大块平涂色彩结合细腻版画肌理，人物小而环境辽阔，清爽旅行杂志插画，无文字。' },
  { title: '月光琴房', tag: '情绪空间', subtitle: '静止琴键上的冷暖交汇', prompt: '夜晚的旧宅琴房，黑色钢琴旁只有一盏小台灯，月光从高窗照在琴键和地板上，琴凳上搭着一件浅色针织外套。斜侧中景，深蓝与琥珀暖光，真实木地板和漆面反射，安静含蓄的电影场景。' },
  { title: '冰川来客', tag: '动物风光', subtitle: '蓝色冰壁旁的白色身影', prompt: '一只北极狐站在蓝色冰川前的雪地上，厚实白毛被微风吹起，回头望向镜头，脚下留有一串浅浅足印。低机位中景，阴天柔光，冰层纹理清晰，白与冰蓝色调，真实野生动物摄影，不拟人化。' },
  { title: '拼贴都市', tag: '平面设计', subtitle: '纸张碎片重新组成街道', prompt: '用旧报纸、彩色纸与黑白建筑照片拼贴一座现代城市，红色圆形太阳位于上方，阶梯、窗格和街道构成有节奏的几何层次。米白纸背景，手工撕边与印刷网点清晰，现代编辑插画，避免可读文字。' },
  { title: '手作皮包', tag: '工艺广告', subtitle: '针脚与皮革的真实触感', prompt: '一只深棕植鞣皮手提包放在工作台上，旁边有缝针、蜡线与裁切后的皮革边料，包面自然纹路和手工针脚清晰。三分之二侧面构图，暖色窗光，背景工具适度虚化，无品牌标志，精致工艺产品摄影。' },
  { title: '稻田晚风', tag: '乡野生活', subtitle: '收获季里金色的归途', prompt: '秋日傍晚的稻田，一条窄田埂通向远处白墙村落，一位农人背着竹筐缓缓归家，金黄稻穗随风弯曲。平视广角，低落日逆光，天空淡粉，人物位于画面下方，自然真实的乡野纪实摄影。' },
  { title: '水晶棋局', tag: '创意静物', subtitle: '透明与磨砂之间的博弈', prompt: '透明玻璃与磨砂水晶棋子摆在深蓝棋盘上，棋盘由交错玻璃片组成，一枚棋子靠近前景，后方棋列逐渐虚化。低机位近景，窄条侧逆光，精确反射折射，银蓝配色，克制的高端静物摄影。' },
  { title: '浮岛农场', tag: '奇幻世界', subtitle: '天空中的麦田与小屋', prompt: '一座漂浮在天空的岛屿，岛上金色麦田环绕石头小屋，风车立在边缘，根系和瀑布从岛底垂向云层，一只小飞艇靠近码头。远景斜俯视，明亮午后光，完整岛屿轮廓，细致幻想概念设计。' },
  { title: '花瓣浴室', tag: '室内美学', subtitle: '粉色石材与自然的晨光', prompt: '一间现代浴室，淡粉色水磨石墙面与椭圆白色浴缸，窄窗外竹叶投下柔和影子，浴缸边放一只玻璃瓶与折叠亚麻毛巾，水面漂几片白色花瓣。广角平视，清晨柔光，材质真实，简洁舒适的室内摄影。' },
  { title: '夜航渔船', tag: '海上纪实', subtitle: '微暗海面上的工作灯', prompt: '蓝调时刻的近海，一艘小型渔船停在微起伏海面，船上工作灯照亮渔网和两位忙碌渔民，远处岸线只有零星灯火。岸边长焦视角，深蓝与暖黄配色，真实水面倒影与人物动作，克制的人文摄影。' },
  { title: '折纸飞鸟', tag: '艺术装置', subtitle: '有序排列中的一次出走', prompt: '一组白色折纸鸟悬在奶油色展厅中，大多数整齐排列，一只朱红色纸鸟偏离队列飞向右上方，细线几乎不可见。仰视广角，柔和顶光，纸张折痕与轻微阴影清晰，极简当代艺术装置，无文字。' },
  { title: '银杏长椅', tag: '季节摄影', subtitle: '金黄叶片中的短暂停留', prompt: '城市公园的一条木质长椅被金黄银杏叶环绕，长椅上放着一条深绿围巾与合上的书，背景银杏树形成层叠纵深。阴天柔光，平视中景，真实落叶纹理，金黄与墨绿配色，温暖安静的秋日摄影。' },
  { title: '香料地图', tag: '食材摄影', subtitle: '色彩与颗粒组成的风味地形', prompt: '俯拍一张摆满香料的深色木桌，红辣椒粉、姜黄、孜然与八角分别置于大小不同的陶碟，肉桂与月桂叶在碟间串联，布局像抽象地图。侧光强调颗粒与纹理，暖色丰富但有秩序，真实食材商业摄影。' },
  { title: '复古跑车', tag: '汽车摄影', subtitle: '旷野公路上的奶油白轮廓', prompt: '一辆无品牌标志的奶油白复古跑车停在旷野公路旁，圆形车灯与银色保险杠保留经典比例，背景是低矮山丘和淡蓝天空。车身三分之二前侧视角，傍晚柔光，真实漆面反射与橡胶纹理，汽车杂志摄影。' },
  { title: '昆虫旅舍', tag: '微观自然', subtitle: '枯木缝隙里的生命细节', prompt: '雨后的枯木缝隙中，一只瓢虫停在苔藓上，小蘑菇从木纹间长出，蛛网上挂着透明露珠。自然微距视角，主体与露珠清晰，背景浅景深，柔和森林天光，强调真实生物尺度和木质纹理，生态摄影。' },
  { title: '星图寝室', tag: '儿童空间', subtitle: '把探索宇宙的梦留在床边', prompt: '一间温暖的儿童卧室，浅木床架与深蓝床品，墙上是没有文字的简洁星图装饰，球形床头灯发出暖光，地毯上摆几块木质积木。平视广角，蓝白与原木色调，家具结构真实，柔和居住空间摄影。' },
  { title: '墨色群山', tag: '水墨实验', subtitle: '山的轮廓与现代色块相遇', prompt: '一幅现代水墨山景，浓淡墨色构成层叠山峰，细小松树点缀山脊，一块平涂朱红圆形日轮悬在留白天空中。横向构图，宣纸纤维与墨迹晕染清晰，传统笔触结合现代几何，无文字与印章。' },
  { title: '甜橙包装', tag: '包装设计', subtitle: '明快色块里的鲜果气息', prompt: '三只甜橙果汁包装纸盒摆在浅橙摄影棚中，盒面使用橙子切片图形、奶油白留白和深绿小色块，侧边折线与纸张结构真实，旁边放半颗鲜橙。三分之二视角，明亮柔光，无可读文字，清爽品牌包装展示。' },
  { title: '雨后天台', tag: '城市生活', subtitle: '积水映出一小片晴空', prompt: '雨后的住宅天台，几盆绿植排列在矮墙边，晾衣绳上挂着浅色床单，地面积水映出刚放晴的天空，一只黑白猫坐在旧木凳上。平视宽幅，柔和傍晚光，真实水痕与布料，带有生活温度的胶片摄影。' },
  { title: '时间标本', tag: '超现实艺术', subtitle: '把不同季节封存在玻璃中', prompt: '四只透明玻璃罩排列在浅灰石台上，分别封存微缩春花、夏日绿树、秋叶与雪中枯枝，植物比例一致，罩底铺细沙。正面构图，柔和侧逆光，精确玻璃反射，季节色彩由左向右变化，超现实艺术静物摄影。' },
  { title: '黎明信号', tag: '未来景观', subtitle: '荒原之上回应天空的光', prompt: '黎明时分的红色岩石荒原，一座细长银色信号塔立在地平线上，塔顶淡蓝光环亮起，一位穿白色探索服的旅人站在前景望向它。低机位广角，晨光照亮岩石纹理，宏大环境与小人物形成对比，写实科幻电影概念图。' },
]

const videoTemplates: PromptTemplate[] = [
  { title: '晨光开窗', tag: '生活短片', subtitle: '侧面定机 · 晨光渐入', prompt: '清晨的浅色卧室，一位穿亚麻衬衫的成年人缓缓拉开窗帘，阳光从窄缝扩展到地板和床面。镜头在房间侧面固定，窗帘随微风轻摆，细微浮尘可见，人物动作自然连贯，奶油白与暖金色，写实生活短片，一镜到底。' },
  { title: '雨巷花车', tag: '城市故事', subtitle: '低位跟拍 · 雨水倒影', prompt: '雨后的石板小巷，一位店员推着载满鲜花的手推车缓缓前行，车轮经过浅水洼荡起涟漪。镜头从侧后方低位平稳跟拍，拱门和暖色店灯依次经过背景，花瓣轻晃，蓝灰街道与柔粉鲜花形成对比，真实电影质感。' },
  { title: '青柠入杯', tag: '饮品广告', subtitle: '微距定机 · 清透慢动作', prompt: '浅绿背景前的一杯透明气泡水，一片青柠落入水中带起小幅水花，随后缓缓下沉，气泡附着果皮并向上升起。微距固定镜头，侧逆光照亮冰块与水珠，杯形保持稳定，液体运动自然，高速慢动作质感，清爽商业广告。' },
  { title: '海崖归途', tag: '户外旅行', subtitle: '侧向跟随 · 日落远景', prompt: '日落时分的海边悬崖步道，一位背小背包的旅人缓缓前行，风吹动外套和草叶。镜头从侧面平稳跟随，末尾轻轻拉远露出海岸线，夕阳为人物勾出暖色轮廓，海浪运动自然，辽阔宁静的旅行电影画面。' },
  { title: '松鼠餐车', tag: '定格动画', subtitle: '桌面横移 · 手工材质', prompt: '森林中的微缩早餐餐车，一只毛毡松鼠将小饼干放到木柜台上，再举起小杯子递向窗外。镜头沿柜台缓慢横移，蒸汽从小茶壶升起，树叶轻晃，毛毡纤维与木纹清晰，动作简单有序，温暖手工定格动画风格。' },
  { title: '香氛流影', tag: '产品广告', subtitle: '小幅环绕 · 玻璃折射', prompt: '深灰石台上一只无标签的烟色香水瓶保持静止，镜头围绕瓶身缓慢移动小半圈，一道窄条柔光沿玻璃棱边滑过，背景薄纱轻轻起伏。精准玻璃折射与金属瓶盖纹理，暗背景，克制银灰色调，精致产品广告，一镜到底。' },
  { title: '稻浪之间', tag: '乡野纪录', subtitle: '低位推进 · 风过稻穗', prompt: '金色稻田中的窄田埂，镜头贴近稻穗缓慢向前推进，一阵风从远处掠来，稻穗依次弯曲，田埂尽头的农人提起竹筐走向村落。傍晚暖光，稻叶与谷粒细节真实，人物保持较小比例，安静自然的乡野纪录片画面。' },
  { title: '纸鸟起飞', tag: '纸艺动画', subtitle: '俯拍定机 · 折纸展开', prompt: '奶油色桌面上一只红色折纸鸟，翅膀缓缓展开，轻轻扇动后离开桌面，向画面右上方飞去，阴影随动作移动。俯拍固定镜头，保持折痕和鸟的形状一致，真实纸张纤维，柔和棚拍光，简洁手工纸艺动画，一镜到底。' },
  { title: '雪林暖屋', tag: '冬日风景', subtitle: '缓慢前推 · 冷暖对照', prompt: '傍晚雪林中一间木屋亮着暖黄窗灯，烟囱升起轻烟，门边一位居民扫去台阶积雪。镜头沿雪中小路缓慢推进，前景松枝轻晃，细雪自然飘落，蓝灰雪景与橙黄窗光交织，真实温暖的冬日电影场景。' },
  { title: '水面来信', tag: '诗意静物', subtitle: '贴水定机 · 涟漪展开', prompt: '安静池塘里一只小纸船缓缓漂过，船中放着折好的米白信件，一滴水从叶尖落下，在纸船旁荡开圆形涟漪。镜头贴近水面固定，纸船随波轻晃，倒映的树影细碎变化，清晨柔光，含蓄真实的诗意短片。' },
  { title: '陶杯上釉', tag: '手作工艺', subtitle: '手部近景 · 连贯操作', prompt: '陶艺工作台上，匠人稳稳托住一只素烧陶杯，用软刷沿杯壁涂上一道鼠尾草绿釉料，再轻轻转动杯身完成另一侧。近景固定镜头，手部动作连贯，刷痕和陶土颗粒清晰，窗边柔光，背景虚化，真实工艺纪录片风格。' },
  { title: '夜市出锅', tag: '美食纪录', subtitle: '侧面特写 · 热气升腾', prompt: '夜市小摊上，一位厨师用锅铲翻动铁锅中的蔬菜，随后将一勺热菜盛入白瓷盘，热气在暖灯下升起。侧面近景，镜头小幅向盘子推进，食材色泽与油光真实，背景灯火柔和虚化，动作清楚自然，充满烟火气的纪录画面。' },
  { title: '云桥列车', tag: '幻想旅途', subtitle: '平行跟拍 · 云海穿行', prompt: '一列深绿色列车沿云海上方的高架桥缓缓行驶，车窗透出暖光，薄云从桥柱间穿过。镜头与列车平行稳定移动，末尾稍稍升高展现弧形桥线和远山，车厢连接与轨道结构保持一致，柔和晨光，写实奇幻电影风格。' },
  { title: '风衣转身', tag: '时尚广告', subtitle: '侧面环绕 · 自然衣摆', prompt: '浅灰摄影棚中，一位成年模特穿深绿风衣站在石台旁，缓缓转身半圈，手指轻扶衣领后自然放下。镜头从正侧面小幅环绕，柔风吹动衣摆，保持面部和服装结构一致，自然皮肤纹理，精准柔光，克制的时尚广告。' },
  { title: '萤光玻璃瓶', tag: '微缩幻想', subtitle: '特写前推 · 轻微闪烁', prompt: '旧木桌上一只玻璃瓶内生长着微缩森林，几只小萤火虫缓缓飞行，光点柔和明灭，苔藓边缘挂着露珠。镜头缓慢前推，瓶子始终静止，窗外夜色映在玻璃上，温暖微光与深蓝背景，真实材质的童话短片。' },
  { title: '潮汐岩岸', tag: '自然风光', subtitle: '低位定机 · 海浪往复', prompt: '清晨黑色岩岸，一道海浪缓缓涌入狭长岩缝，白色泡沫围绕前景礁石展开，再退去露出湿润石面。低机位固定镜头，远处淡粉天空与海面相连，水流物理自然，岩石纹理清晰，安静通透的海岸纪录片画面。' },
  { title: '咖啡拉花', tag: '饮食广告', subtitle: '斜俯拍 · 奶泡成形', prompt: '咖啡师一手托住陶杯，一手缓缓倒入牛奶，白色奶泡在深棕咖啡表面形成简洁叶片图案，最后抬起奶缸收尾。斜俯拍近景固定镜头，杯形和手部保持一致，奶流连续自然，暖色窗光，真实液体与陶瓷纹理，精品咖啡广告。' },
  { title: '星港泊船', tag: '硬核科幻', subtitle: '侧面定机 · 缓慢停靠', prompt: '轨道空间港外，一艘小型货运飞船缓缓靠近停泊架，姿态调整喷口短暂亮起，船体对准接口后平稳停下。侧面固定远景，背景行星缓慢转动，飞船结构稳定，真实金属材料与工作灯，精密克制的硬科幻电影场景。' },
  { title: '花店收工', tag: '人物故事', subtitle: '门外定机 · 温暖窗光', prompt: '傍晚街角花店，一位成年店主把最后一桶花移进门内，擦擦手，随后翻转门口小木牌。镜头从街对面固定观察，窗内暖灯照亮花瓣，门外树影轻晃，木牌没有可读文字，动作松弛连贯，温暖真实的城市生活短片。' },
  { title: '镜中芭蕾', tag: '舞蹈片段', subtitle: '侧向横移 · 简单伸展', prompt: '清晨舞蹈教室里，一位成年舞者扶着把杆缓缓伸展手臂，再踮起脚尖停稳，镜中同步映出动作。镜头沿把杆平稳横移，保持身体比例与倒影一致，窗光照亮木地板，浅色练功服，优雅真实的舞蹈短片。' },
  { title: '竹林听雨', tag: '东方意境', subtitle: '近景定机 · 雨滴滑落', prompt: '细雨中的竹林，前景一片竹叶承接雨珠，水滴逐渐汇聚后从叶尖滑落，竹枝轻轻弯动，背景细雨持续落下。近景固定镜头，浅景深，青绿与雾灰色调，水滴和叶脉细节真实，宁静的自然短片，无人物。' },
  { title: '皮革缝线', tag: '精细工艺', subtitle: '微距定机 · 单针收紧', prompt: '手工皮具工作台上，匠人的双手将针穿过深棕皮革边缘的预留孔，再平稳拉紧蜡线完成一针。微距固定镜头，针线连接合理，皮革纹路和手部细节真实，柔和侧光，背景工具虚化，专注克制的工艺纪录画面。' },
  { title: '海边晾晒', tag: '日常诗意', subtitle: '长焦定机 · 织物起伏', prompt: '海边小屋外，一排白色床单随风缓缓起伏，缝隙间露出蓝色海面，一位居民从画面边缘走入，夹好最后一只木夹。固定长焦镜头，动作自然，阳光穿透布料，柔和胶片色彩，安静的夏日生活画面。' },
  { title: '山路单车', tag: '运动旅行', subtitle: '侧后跟拍 · 平缓过弯', prompt: '晨光中的山间公路，一位骑行者沿平缓弯道稳定骑行，镜头从侧后方跟随，车轮转动与踩踏同步，路旁松树依次经过。始终保持同一骑行方向，末尾稍稍拉远显露山谷，装备和车架结构真实，清新户外广告质感。' },
  { title: '书页与猫', tag: '宠物生活', subtitle: '桌面定机 · 轻触书页', prompt: '窗边书桌上一本书摊开，一只黑白猫伸出前爪轻触翘起的书页，纸页慢慢翻落，猫转头看向窗外。桌面高度固定镜头，真实猫的动作与毛发，窗帘轻晃，书页不显示可读文字，柔和午后光，温暖轻松的宠物短片。' },
  { title: '果酱涂抹', tag: '早餐广告', subtitle: '微距近景 · 质感展示', prompt: '木板上一片金黄吐司，一把圆头餐刀将红色莓果酱缓缓抹开，果酱中细小果粒清晰，刀尖最后轻轻抬起。微距侧面固定镜头，真实涂抹力度与吐司孔洞，窗边柔光，浅色背景，食物新鲜自然，清爽早餐商业广告。' },
  { title: '沙丘脚印', tag: '旅行风光', subtitle: '低位跟随 · 风沙掠过', prompt: '日出时的沙丘，一位旅人的双脚沿沙脊缓缓行走，每一步压出清晰脚印，细沙从坡面轻轻滑落。镜头从侧后方低位平稳跟随，金色斜光勾出沙纹，风轻吹裤脚，保持步态自然，辽阔真实的旅行电影质感。' },
  { title: '银饰流光', tag: '珠宝广告', subtitle: '微距横移 · 金属轮廓', prompt: '深蓝丝绒上一对银色耳饰保持静止，镜头沿耳饰边缘缓慢横移，一道柔和条形光掠过弧面，浅蓝宝石出现细腻光泽。微距浅景深，真实金属与宝石反射，造型全程一致，背景干净，精致克制的珠宝商业广告。' },
  { title: '纸城日出', tag: '创意动画', subtitle: '缓慢推进 · 光影变化', prompt: '桌面上的米白纸模型城市，镜头沿中央街道缓慢推进，一轮橙色纸太阳从楼群后方缓缓升起，光线随之照亮纸屋立面。建筑保持静止且结构一致，纸张纤维和折痕清晰，阴影变化自然，极简手工纸艺动画，无文字。' },
  { title: '鹿过晨雾', tag: '野生动物', subtitle: '长焦定机 · 林间穿行', prompt: '清晨薄雾中的森林边缘，一只鹿从树干后缓缓走出，停下抬头观察，再向草地迈出一步。固定长焦镜头，鹿的步态和身体比例自然，晨光穿过树叶，雾气轻轻流动，真实野生动物纪录片风格，不拟人化。' },
  { title: '厨房揉面', tag: '家庭生活', subtitle: '手部近景 · 连续按压', prompt: '浅色厨房的木质案板上，一双手轻轻折叠面团，再向前按压揉开，少量面粉落在桌面，旁边静置一只陶碗。近景固定镜头，面团随力度自然变形，手部动作简单连贯，清晨柔光，真实食物与木纹，温暖生活纪录风格。' },
  { title: '瀑布虹光', tag: '自然奇观', subtitle: '横向慢移 · 水雾闪光', prompt: '阳光照亮森林瀑布，水流沿岩壁连续落入深潭，近处水雾中出现淡淡彩虹。镜头在岸边缓慢横移，前景蕨叶逐渐划过边缘，水流速度和方向自然，石壁与植被细节清晰，清爽真实的风光纪录片。' },
  { title: '温室洒水', tag: '园艺生活', subtitle: '侧面跟随 · 水珠落叶', prompt: '玻璃温室里，一位园艺师提着小水壶缓缓浇灌绿植，水流落在叶片和土面，叶片因水珠轻微颤动。镜头从侧面跟随一小段距离，人物和水壶保持一致，顶部天光柔和，真实水流和植物纹理，安静清新的生活短片。' },
  { title: '灯塔启明', tag: '海岸电影', subtitle: '远景定机 · 灯束旋转', prompt: '蓝调时刻的岩石海岸，一座白色灯塔的灯光缓缓扫过海面，浪花持续拍打前景礁石，塔下小屋亮着暖灯。远景固定镜头，灯束旋转匀速自然，天空由浅紫过渡到深蓝，真实海水和石壁，宁静有故事感的电影场景。' },
  { title: '旧车启程', tag: '公路短片', subtitle: '侧面定机 · 平稳驶离', prompt: '傍晚旷野公路旁，一辆奶油白复古小车由静止缓缓起步，沿道路驶向远处，轮胎卷起少量细尘。镜头在路边固定，车身和轮轴结构保持一致，夕阳在漆面形成暖色反光，远山安静，真实克制的公路电影片段。' },
  { title: '雪狐回望', tag: '极地自然', subtitle: '低位定机 · 转头停留', prompt: '蓝色冰壁旁的雪地，一只北极狐向前迈出两步，停下缓缓回头看向镜头，尾巴自然下垂，风轻吹蓬松毛发。低机位固定中景，保持四肢比例和步态真实，阴天柔光，冰层细节清晰，安静的野生动物纪录片画面。' },
  { title: '玻璃雨滴', tag: '抽象光影', subtitle: '微距定机 · 焦点过渡', prompt: '一面布满雨滴的玻璃窗，一颗较大的水滴沿窗面缓缓滑下，连接沿途小水珠，窗外红蓝灯光化成柔和光斑。微距固定镜头，焦点从静止水珠轻轻移向滑落水滴，水流真实，夜色低饱和，抽象宁静的光影短片。' },
  { title: '帐篷醒来', tag: '户外生活', subtitle: '帐内定机 · 门帘开启', prompt: '清晨帐篷内，镜头固定朝向门口，一双手缓缓拉开门帘，露出晨雾中的山谷和被日光照亮的草甸。门帘展开后轻轻晃动，前景睡袋与金属杯静止，真实织物与自然光，温暖清新的露营旅行片段，一镜到底。' },
  { title: '画笔落色', tag: '艺术纪录', subtitle: '纸面特写 · 颜料晕开', prompt: '米白水彩纸上，一支画笔缓缓画出一片青绿色叶子，颜料在湿润纸面自然晕开，笔尖抬起后留下一道细细叶脉。斜俯拍特写固定镜头，真实笔触与纸张颗粒，窗边柔光，背景干净，专注宁静的绘画过程短片。' },
  { title: '蒸汽面馆', tag: '城市烟火', subtitle: '窗口推进 · 上菜动作', prompt: '清晨小面馆的出餐窗口，一位店员将一碗热面轻轻放到台面，撒上少量葱花，碗口蒸汽在暖灯下升起。镜头从窗口外缓慢靠近，手部和碗形一致，真实面条与汤面质感，背景忙碌但柔和虚化，温暖纪实电影风格。' },
  { title: '风过风铃', tag: '东方生活', subtitle: '近景定机 · 轻摆旋转', prompt: '木质屋檐下一只透明玻璃风铃随微风轻轻摆动，细长纸条缓慢旋转，背景是柔焦的夏日绿树。近景固定镜头，玻璃和细绳结构一致，阳光穿过风铃形成小光斑，纸条无可读文字，清新安静的生活短片。' },
  { title: '机械花开', tag: '工业幻想', subtitle: '中央定机 · 有序展开', prompt: '深灰台面上一朵由银色薄金属片组成的机械花，花瓣沿铰链依次向外展开，露出中央柔和蓝色光源，最后稳定停住。中央近景固定镜头，机械连接清楚合理，金属表面反射真实，背景简洁，精密克制的工业幻想广告。' },
  { title: '港口晨班', tag: '劳动纪录', subtitle: '侧向横移 · 整理绳索', prompt: '清晨港口的木质码头，一位渔民将系船绳整理成圈，抬起绳圈挂到木桩上，身后小渔船随水面轻轻起伏。镜头沿码头平稳横移，手部动作与绳索连接真实，雾中日光柔和，蓝灰与原木色，尊重人物的纪实短片。' },
  { title: '月面漫步', tag: '航天科幻', subtitle: '侧后跟拍 · 低重力步态', prompt: '月球基地外，一位穿白色宇航服的探索者沿灰白地表缓缓前行，低重力步伐带起少量细尘，远处基地舱体静止。镜头从侧后方平稳跟拍，宇航服和背包结构一致，黑色天空中悬着地球，真实航天材料与强烈日光，硬科幻电影画面。' },
  { title: '落叶长椅', tag: '季节片段', subtitle: '低位定机 · 落叶停稳', prompt: '秋日公园的木长椅旁，一片金黄色银杏叶从上方缓缓飘落，在椅面转动半圈后停住，背景树枝随风轻摆。低位固定近景，叶片运动自然，真实木纹与叶脉，柔和午后光，细腻胶片色彩，安静的季节短片。' },
  { title: '冰上热茶', tag: '旅行静物', subtitle: '杯口特写 · 缓慢后拉', prompt: '雪地木桌上一只保温杯被倒入热茶，蒸汽缓缓升起，戴手套的手收起水壶。镜头从杯口特写轻轻后拉，露出背景湖畔帐篷和远处雪山，倒茶动作与液体真实，清冷环境配温暖茶色，精致户外生活广告。' },
  { title: '折扇轻启', tag: '传统工艺', subtitle: '手部特写 · 扇面展开', prompt: '深色木桌前，一双手握住竹骨折扇，缓缓将扇面展开至半圆，再稳稳停下，扇面是一幅无题字的淡墨山景。手部特写固定镜头，竹骨数量和连接一致，纸纹真实，柔和侧光，克制优雅的东方工艺短片。' },
  { title: '花瓣旋舞', tag: '创意广告', subtitle: '俯拍定机 · 水流环绕', prompt: '浅色圆形水盘中央放着一只无标志白色护肤罐，外围水面上的几片淡粉花瓣沿轻缓水流旋转，细小涟漪掠过罐底。俯拍固定镜头，产品保持静止，水流和花瓣运动自然，明亮柔光，简洁清透的护肤商业广告。' },
  { title: '巷口修车', tag: '手艺人物', subtitle: '近景定机 · 检查车轮', prompt: '老巷修车铺前，一位师傅扶住自行车后轮，轻轻转动车轮检查轮圈，再用工具微调一处零件。近景固定镜头，轮辐和手部动作真实，阳光照亮金属边缘，背景旧墙柔和虚化，生活气息自然，尊重手艺人的纪实画面。' },
  { title: '群星露台', tag: '夜色幻想', subtitle: '缓慢后拉 · 光点升起', prompt: '夜晚山间小屋的露台上，一位披着浅色毯子的成年人坐在木椅中望向天空，几只萤火虫从草丛中缓缓升起，星空保持稳定。镜头从肩后轻轻拉远，毯子随风微动，小桌灯发出暖光，真实环境与梦幻微光结合，宁静的一镜到底。' },
]

const imageCapabilities: Array<{ id: ImageCapability; label: string }> = [
  { id: 'image2', label: 'Image2 生图' },
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
const historyCollapsed = ref(false)
const groups = ref<Group[]>([])
const apiKeys = ref<ApiKey[]>([])
const selectedGroupId = ref(0)
const modelOptions = ref<string[]>([])
const selectedModel = ref('')
const prompt = ref('')
const referenceImages = ref<ReferenceImage[]>([])
const aspectRatio = ref('1:1')
const imageResolution = ref('1K')
const imageSizeMode = ref<ImageSizeMode>('ratio')
const imageCustomWidth = ref(1024)
const imageCustomHeight = ref(1024)
const imageSizeDialogOpen = ref(false)
const imageSizeDraftMode = ref<ImageSizeMode>('ratio')
const imageSizeDraftResolution = ref('1K')
const imageSizeDraftRatio = ref('1:1')
const imageSizeDraftWidth = ref(1024)
const imageSizeDraftHeight = ref(1024)
const videoResolution = ref('720p')
const videoGenerationMethod = ref<VideoGenerationMethod>('text')
const imageQuality = ref('auto')
const outputFormat = ref('png')
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
  resolution: '720p',
}])
const selectedShotId = ref(videoShots.value[0].id)
const historyItems = ref<CreatorHistoryItem[]>([])
const selectedWork = ref<CreatorHistoryItem | null>(null)
const referencingOutputKey = ref('')
const downloadingOutputKey = ref('')
const activeTemplateIndex = ref(0)
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
}
// Each request owns its state and immutable inputs. Browsing or starting another
// creation only changes the selection, never the request that is already running.
const activeGenerations = reactive(new Map<string, GenerationTask>())
const selectedGeneration = computed(() => selectedWork.value ? activeGenerations.get(selectedWork.value.id) : undefined)
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
const previewImageCacheKey = computed(() => {
  const work = selectedWork.value
  const index = work?.outputs.indexOf(previewUrl.value) ?? -1
  return work && index >= 0 ? `${work.id}:${work.updatedAt}:${index}` : undefined
})
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
const settingsScrollElement = ref<HTMLElement | null>(null)
let studioActive = true
let generationTimer: number | undefined
let templateAutoplayTimer: number | undefined
let restoreSettingsSequence = 0
const restoringWorkSettings = ref(false)
const transientObjectUrls = new Set<string>()

const activeTemplates = computed(() => studioMode.value === 'image' ? imageTemplates : videoTemplates)
const activeTemplate = computed(() => activeTemplates.value[activeTemplateIndex.value] || activeTemplates.value[0])
const selectedVideoHistoryFeedback = computed(() => (
  videoHistoryFeedback.value?.workId === selectedWork.value?.id ? videoHistoryFeedback.value : null
))
const promptTemplatePageSize = 6
const promptTemplatePageCount = computed(() => Math.max(1, Math.ceil(activeTemplates.value.length / promptTemplatePageSize)))
const visiblePromptTemplates = computed(() => {
  const start = promptTemplatePage.value * promptTemplatePageSize
  return activeTemplates.value.slice(start, start + promptTemplatePageSize)
})
const promptLimit = computed(() => imageCapability.value === 'image2' && studioMode.value === 'image' ? 32000 : 8000)
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
const videoResolutionOptions = computed(() => (videoSupports1080p.value ? ['480p', '720p', '1080p'] : ['480p', '720p']))
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
    return activeVideoGenerationMethod.value === 'image' ? 1 : 7
  }
  if (imageCapability.value === 'image2') return 16
  return 3
})
const maxOutputCount = computed(() => isSingleOutputImageModel(selectedModel.value, imageResolution.value, imageCapability.value) ? 1 : 4)
const referenceFieldVisible = computed(() => studioMode.value === 'image' || activeVideoGenerationMethod.value !== 'text')
const referenceFieldLabel = computed(() => studioMode.value === 'video' && activeVideoGenerationMethod.value === 'image' ? '源图' : '参考图')
const referenceHint = computed(() => {
  if (studioMode.value === 'video' && activeVideoGenerationMethod.value === 'image') return '必选，仅 1 张，作为当前镜头首帧'
  if (studioMode.value === 'video') return '必选，最多 7 张，仅支持 Grok Imagine Video 1.5'
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
  enabled: virtualizeHistory.value && !historyCollapsed.value,
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
    const next = Math.max(1, Math.min(15, value))
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
    ? `${videoShots.value.length} 个镜头 · 共 ${estimatedVideoDuration.value} 秒 · 按各镜头清晰度汇总`
    : `${videoResolution.value} · ${videoDuration.value} 秒 · 已计入当前适用倍率`
})
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
const estimatedVideoMode = computed(() => professionalVideo.value && videoShots.value.length > 1 ? '按镜头顺序拼接' : '单段视频')
const effectivePrompt = computed(() => {
  if (studioMode.value === 'video' && professionalVideo.value) {
    return videoShots.value[0]?.prompt.trim() || ''
  }
  return prompt.value.trim()
})
const referenceVideoModelOptions = computed(() => modelOptions.value.filter(isGrokVideo15Model))
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
  if (requiresReferenceVideo15.value && !isGrokVideo15Model(selectedModel.value)) return false
  if (studioMode.value === 'video' && professionalVideo.value) {
    return totalShotDuration.value <= 60
      && videoShots.value.length > 0
      && videoShots.value.every(shot => (
        shot.prompt.trim()
        && shot.prompt.length <= 8000
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
  if (studioMode.value === 'video') return group.platform === 'grok' || /grok|xai/.test(haystack)
  if (imageCapability.value === 'grok') {
    return (group.allow_image_generation && group.platform === 'grok') || /grok.*(图|image)|xai/.test(haystack)
  }
  if (imageCapability.value === 'image2') {
    return (group.allow_image_generation && group.platform === 'openai') || /image\s*2|gpt[ -]?image|原生[24]k/.test(haystack)
  }
  return group.platform === 'gemini' || group.platform === 'antigravity' || /banner|banana|香蕉/.test(haystack)
}

function fallbackModels() {
  if (studioMode.value === 'video') return ['grok-imagine-video', 'grok-imagine-video-1.5']
  if (imageCapability.value === 'grok') return ['grok-imagine-image', 'grok-imagine-image-quality']
  if (imageCapability.value === 'image2') return ['gpt-image-2']
  return ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image']
}

function isGrokVideo15Model(model: string) {
  return /^grok-imagine-video-1\.5(?:$|-)/i.test(model.trim().replace(/^models\//i, ''))
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
  if (studioMode.value === 'video') return 'grok-imagine-video'
  if (imageCapability.value === 'grok') return 'grok-imagine-image'
  if (imageCapability.value === 'image2') return 'gpt-image-2'
  return 'gemini-3-pro-image-preview'
}

function filterModels(models: string[]) {
  const clean = Array.from(new Set(models.map(model => model.trim()).filter(Boolean)))
  if (studioMode.value === 'video') {
    return clean.filter(model => /video/i.test(model))
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
    return previous && previous.updatedAt > work.updatedAt ? previous : work
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
    selectedShotId.value = videoShots.value[0]?.id || ''
  }
  await nextTick()
  const previous = historyItems.value.find(work => work.id === modeSelections[mode])
  if (studioMode.value === mode && previous) await selectWork(previous)
}

function useTemplate(template: PromptTemplate) {
  editorPrompt.value = template.prompt
}

function adjustVideoDuration(delta: -1 | 1) {
  configuredVideoDuration.value += delta
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
  for (const file of files) {
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

async function generateFromCurrentSettings(source: string) {
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
          generationMethod: shot.generationMethod,
          referenceFiles: shot.referenceImages.map(reference => reference.file),
        }))
      : [{
          prompt: taskPrompt,
          duration: videoDuration.value,
          resolution: videoResolution.value,
          aspectRatio: aspectRatio.value,
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
    provider: taskMode === 'image' ? imageCapabilities.find(item => item.id === imageCapability.value)?.label || imageCapability.value : 'Grok 视频',
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
  try {
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
    applyHistoryUpdate(cloneWork(work))
    appStore.showSuccess('作品生成完成')
  } catch (error) {
    work.status = 'failed'
    work.updatedAt = Date.now()
    work.error = creatorGenerationErrorMessage(error, taskMode)
    applyHistoryUpdate(cloneWork(work))
    await persistWork(work)
    appStore.showError(work.error)
  } finally {
    activeGenerations.delete(work.id)
    if (!activeGenerations.size && generationTimer !== undefined) {
      window.clearInterval(generationTimer)
      generationTimer = undefined
    }
  }
}

async function generateImageWork(work: CreatorHistoryItem, input: ImageGenerationSnapshot, task: GenerationTask) {
  task.phase = 'generating'
  task.hasExactProgress = false
  const requestCount = Math.max(1, input.outputCount || 1)
  const requestAttempts = input.capability === 'image2' ? requestCount : 1
  const requestN = input.capability === 'image2' ? 1 : input.outputCount
  const isGeminiProtocol = input.platform === 'gemini' || input.platform === 'antigravity'
  const usesOpenAIImageSize = input.capability === 'image2'
  const usesGptImageModel = /^gpt-image-/i.test(input.model.trim())
  // GPT Image models return b64_json by default and reject response_format.
  // Grok still needs the explicit response format so its temporary URLs are
  // converted into self-contained data URLs by the gateway.
  const usesBase64Response = !isGeminiProtocol && !usesGptImageModel && input.capability === 'grok'
  const outputs: string[] = []
  const generate = () => generateCreatorImage(input.apiKey, {
    model: input.model,
    prompt: input.prompt,
    n: requestN,
    size: input.size,
    quality: input.quality,
    outputFormat: input.outputFormat,
    background: 'auto',
    // Grok may return temporary cross-origin URLs that browsers cannot save
    // through the download attribute. Base64 keeps the result self-contained.
    ...(usesBase64Response ? { responseFormat: 'b64_json' } : {}),
    referenceImages: input.referenceFiles,
    protocol: isGeminiProtocol ? 'gemini' : 'openai',
    ...(!usesOpenAIImageSize ? {
      aspectRatio: input.aspectRatio,
      imageSize: input.resolution,
    } : {}),
  })
  for (let index = 0; index < requestAttempts && outputs.length < requestCount; index++) {
    task.progress = requestCount > 1
      ? `正在生成第 ${index + 1} / ${requestCount} 张图片`
      : '正在调用图片模型，请稍候'
    let result
    try {
      result = await generate()
    } catch (error) {
      if (input.capability !== 'grok' || !isRetryableGrokTransientError(error)) throw error
      task.progress = 'Grok 上游暂时不可用，2 秒后自动重试（1/1）'
      await delay(2000)
      task.progress = requestCount > 1
        ? `正在重试第 ${index + 1} / ${requestCount} 张图片`
        : '正在重新调用 Grok 图片模型'
      result = await generate()
    }
    const batchOutputs = result.data.map(item => item.url).filter(Boolean)
    if (input.capability !== 'image2') {
      const sourceSizes = await Promise.all(batchOutputs.map(readCreatorImageSize))
      work.upstreamImageSizes = [...(work.upstreamImageSizes || []), ...sourceSizes.slice(0, requestCount - outputs.length)]
    }
    const normalizedOutputs = input.sizeMode !== 'auto'
      ? await Promise.all(batchOutputs.map(output => normalizeCreatorImageOutput(output, input.aspectRatio, input.size)))
      : batchOutputs
    outputs.push(...normalizedOutputs.slice(0, requestCount - outputs.length))
    if (input.sizeMode !== 'auto' && /^\d+x\d+$/.test(input.size)) {
      work.actualOutputSize = input.capability === 'image2' ? input.size : await readCreatorImageSize(normalizedOutputs[0] || '') || undefined
    }
    work.outputs = [...outputs]
    work.updatedAt = Date.now()
    await persistWork(work)
  }
  work.outputs = outputs
  if (!work.outputs.length) throw new Error('模型没有返回可用图片')
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

async function normalizeHistoricalImageWork(work: CreatorHistoryItem) {
  if (work.type === 'image' && work.imageCapability !== 'image2') {
    if (work.upstreamImageSizes || !work.outputs.length) return
    const sizes = await Promise.all(work.outputs.map(readCreatorImageSize))
    if (!sizes.some(Boolean)) return
    work.upstreamImageSizes = sizes
    work.actualOutputSize = sizes[0] || undefined
    await persistWork(work)
    return
  }
  if (work.imageCapability !== 'image2' || work.imageSizeMode === 'auto' || !/^\d+x\d+$/.test(work.outputSize || '') || !work.outputs.length) return
  if (work.actualOutputSize === work.outputSize) return
  const requestedSize = work.outputSize || ''
  const normalizedOutputs = await Promise.all(work.outputs.map(output => normalizeCreatorImageOutput(output, work.aspectRatio || '1:1', requestedSize)))
  const changed = normalizedOutputs.some((output, index) => output !== work.outputs[index])
  const hadActualSize = work.actualOutputSize === requestedSize
  work.outputs = normalizedOutputs
  work.actualOutputSize = requestedSize
  if (changed || !hadActualSize) {
    work.updatedAt = Date.now()
    await persistWork(work)
  }
  historyItems.value = historyItems.value.map(item => item.id === work.id ? cloneWork(work) : item)
  if (selectedWork.value?.id === work.id) selectedWork.value = cloneWork(work)
}

function imageDataUrlDimensions(output: string) {
  // PNG dimensions live in the first 24 bytes. Never decode the entire 4K
  // payload just to read its header on a history selection.
  const match = /^data:image\/png;base64,/i.exec(output.slice(0, 32))
  if (!match) return null
  try {
    const decoded = window.atob(output.slice(match[0].length, match[0].length + 128).replace(/\s/g, '').slice(0, 32))
    if (decoded.length < 24 || decoded.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || decoded.slice(12, 16) !== 'IHDR') return null
    const view = new DataView(Uint8Array.from(decoded, character => character.charCodeAt(0)).buffer)
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    return width > 0 && height > 0 ? { width, height } : null
  } catch {
    return null
  }
}

function creatorGenerationErrorMessage(error: unknown, mode: StudioMode = studioMode.value) {
  const message = errorMessage(error, '生成失败')
  if (isRetryableGrokTransientError(error)) {
    return mode === 'video'
      ? `Grok 视频上游暂时不可用，系统已自动重试 ${VIDEO_SUBMISSION_RETRY_DELAYS_MS.length} 次。请稍后带回参数重试；如果频繁出现，请为当前分组增加可用 Grok 账号。`
      : 'Grok 上游服务暂时不可用，系统已自动重试一次。请稍后再试；如果频繁出现，请为该分组增加可用 Grok 账号。'
  }
  if (mode === 'video') return message
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

async function generateVideoWork(work: CreatorHistoryItem, input: VideoGenerationSnapshot, task: GenerationTask) {
  const key = input.apiKey
  const shots = input.shots
  const outputs: string[] = []
  const outputBlobs: Blob[] = []
  const requestIds: string[] = []
  for (let index = 0; index < shots.length; index++) {
    const shot = shots[index]
    const imageDataUrls = await Promise.all(shot.referenceFiles.map(fileToDataUrl))
    const imageDataUrl = shot.generationMethod === 'image' ? imageDataUrls[0] : undefined
    const referenceImageDataUrls = shot.generationMethod === 'reference' ? imageDataUrls : undefined
    task.phase = 'submitting'
    task.hasExactProgress = false
    task.progress = shots.length > 1 ? `正在提交镜头 ${index + 1} / ${shots.length}` : '正在提交视频任务，请稍候'
    task.percent = Math.max(task.percent, Math.round(index / shots.length * 100))
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
        task.progress = shots.length > 1
          ? `镜头 ${index + 1} 上游暂时不可用，${delaySeconds} 秒后自动重试（${retryNumber}/${VIDEO_SUBMISSION_RETRY_DELAYS_MS.length}）`
          : `Grok 上游暂时不可用，${delaySeconds} 秒后自动重试（${retryNumber}/${VIDEO_SUBMISSION_RETRY_DELAYS_MS.length}）`
        await delay(retryDelay)
        task.progress = shots.length > 1
          ? `正在重新提交镜头 ${index + 1} / ${shots.length}`
          : '正在重新提交视频任务'
      }
    }
    if (!created.id) throw new Error('视频接口没有返回任务 ID')
    // Receiving an ID only means the task entered the provider queue. Keep the
    // percentage hidden until polling confirms that rendering has started.
    task.phase = 'generating'
    task.hasExactProgress = false
    task.percent = Math.max(task.percent, Math.round(index / shots.length * 100))
    task.progress = shots.length > 1
      ? `镜头 ${index + 1} 已提交，正在等待生成`
      : '任务已提交，正在等待生成'
    requestIds.push(created.id)
    work.requestId = requestIds.join(',')
    work.updatedAt = Date.now()
    await persistWork(work)
    const videoBlob = await waitForVideo(key, created.id, index, shots.length, task)
    outputBlobs.push(videoBlob)
    outputs.push(createTrackedObjectUrl(videoBlob))
    work.outputs = [...outputs]
    work.videoBlobs = [...outputBlobs]
    work.updatedAt = Date.now()
    await persistWork(work)
  }
  work.outputs = outputs
  if (outputBlobs.length > 1) {
    task.progress = '所有镜头已完成，正在合成完整视频'
    await composeWorkVideo(work, outputBlobs, false)
  }
}

async function waitForVideo(apiKey: string, requestId: string, shotIndex: number, shotCount: number, task: GenerationTask) {
  let monotonicProgress = task.percent

  const updateProgress = (candidate: number) => {
    monotonicProgress = Math.max(monotonicProgress, Math.max(0, Math.min(100, candidate)))
    task.percent = monotonicProgress
  }

  for (let attempt = 0; attempt < 150; attempt++) {
    if (disposed) throw new Error('页面已关闭，任务可稍后从历史记录继续查看')
    if (attempt > 0) await delay(4000)
    const status = await getCreatorVideoStatus(apiKey, requestId)
    const normalized = String(status.status || '').toLowerCase()
    const rawProgress: unknown = status.progress
    const hasReportedProgress = rawProgress !== undefined
      && rawProgress !== null
      && rawProgress !== ''
      && Number.isFinite(Number(rawProgress))
    const reportedProgress = hasReportedProgress ? Number(rawProgress) : Number.NaN
    if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) {
      throw new Error(errorMessage(status.error, '视频生成失败'))
    }
    if (['completed', 'succeeded', 'success', 'done'].includes(normalized) || status.url) {
      task.phase = 'generating'
      task.hasExactProgress = true
      updateProgress(Math.round((shotIndex + 1) / shotCount * 100))
      task.progress = shotCount > 1 ? `镜头 ${shotIndex + 1} 已完成，正在加载视频` : '视频已生成，正在加载结果'
      return getCreatorVideoContent(apiKey, requestId)
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

async function persistWork(work: CreatorHistoryItem) {
  if (work.type === 'video') await captureVideoBlobsForPersistence(work)
  await creatorHistory.put({
    ...work,
    outputs: work.outputs.filter(output => !output.startsWith('blob:')),
    mergedOutput: work.mergedOutput?.startsWith('blob:') ? undefined : work.mergedOutput,
  })
}

function cloneWork(work: CreatorHistoryItem): CreatorHistoryItem {
  return {
    ...work,
    outputs: [...work.outputs],
    upstreamImageSizes: work.upstreamImageSizes ? [...work.upstreamImageSizes] : undefined,
    videoBlobs: work.videoBlobs ? [...work.videoBlobs] : undefined,
    shotPrompts: work.shotPrompts ? [...work.shotPrompts] : undefined,
    shotDurations: work.shotDurations ? [...work.shotDurations] : undefined,
    shotAspectRatios: work.shotAspectRatios ? [...work.shotAspectRatios] : undefined,
    shotResolutions: work.shotResolutions ? [...work.shotResolutions] : undefined,
    shotGenerationMethods: work.shotGenerationMethods ? [...work.shotGenerationMethods] : undefined,
    shotReferenceCounts: work.shotReferenceCounts ? [...work.shotReferenceCounts] : undefined,
    shotActualOutputSizes: work.shotActualOutputSizes ? [...work.shotActualOutputSizes] : undefined,
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
  const objectUrl = URL.createObjectURL(blob)
  transientObjectUrls.add(objectUrl)
  return objectUrl
}

async function selectGeneration(id: string) {
  const work = historyItems.value.find(item => item.id === id)
  if (work) await selectWork(work)
}

async function selectWork(work: CreatorHistoryItem) {
  if (studioMode.value !== work.type) modeSelections[studioMode.value] = selectedWork.value?.id || null
  restorePersistedVideoOutputs(work)
  selectedWork.value = work
  if (videoHistoryFeedback.value?.workId !== work.id) videoHistoryFeedback.value = null
  const needsMergedVideo = isMultiShotVideo(work) && !work.mergedOutput
  const shouldRefreshVideo = !activeGenerations.has(work.id) && work.type === 'video'
    && Boolean(work.requestId)
    && (work.status === 'pending' || !work.outputs.length || needsMergedVideo)
  if (shouldRefreshVideo) loadingVideoWorkId.value = work.id
  await restoreWorkSettings(work)
  if (work.type === 'image' && !activeGenerations.has(work.id)) await normalizeHistoricalImageWork(work)
  if (shouldRefreshVideo) await refreshVideoWork(work, true)
}

async function refreshVideoWork(work: CreatorHistoryItem, quiet = false) {
  if (checkingVideoHistory.value || !work.requestId) {
    if (loadingVideoWorkId.value === work.id) loadingVideoWorkId.value = ''
    return
  }
  if (work.status === 'completed' && !work.outputs.length) loadingVideoWorkId.value = work.id
  const key = findKeyForWork(work)
  if (!key) {
    const message = '未找到该作品分组对应的可用 Key，暂时无法检查任务状态。'
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
  try {
    const outputs: string[] = []
    const outputBlobs: Blob[] = []
    let pending = false
    for (const requestId of work.requestId.split(',').map(id => id.trim()).filter(Boolean)) {
      const status = await getCreatorVideoStatus(key.key, requestId)
      const normalized = String(status.status || '').toLowerCase()
      if (['failed', 'error', 'cancelled', 'canceled', 'expired'].includes(normalized)) {
        work.status = 'failed'
        work.error = normalized === 'expired'
          ? '该视频任务已过期，无法继续查询。请带回原参数重新生成。'
          : videoHistoryErrorMessage(status.error, '视频生成失败，请带回原参数重试。')
        continue
      }
      if (['completed', 'succeeded', 'success', 'done'].includes(normalized) || status.url) {
        const blob = await getCreatorVideoContent(key.key, requestId)
        outputBlobs.push(blob)
        outputs.push(createTrackedObjectUrl(blob))
      } else {
        pending = true
      }
    }
    if (outputs.length) {
      work.outputs = outputs
      work.videoBlobs = outputBlobs
    }
    if (work.status !== 'failed') work.status = pending ? 'pending' : 'completed'
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
    } else if (pending) {
      const message = `最近检查 ${formatVideoStatusCheckTime(work.updatedAt)}：任务仍在生成中，请稍后再试。`
      videoHistoryFeedback.value = { workId: work.id, tone: 'pending', message }
      if (!quiet) appStore.showInfo('任务仍在生成中，请稍后再试')
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
    } else {
      aspectRatio.value = work.aspectRatio || '16:9'
      videoResolution.value = historicalVideoResolution
      videoGenerationMethod.value = work.videoGenerationMethod
        || (work.referenceCount ? 'image' : 'text')
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
    const restoringReferenceVideo = work.type === 'video' && requiresReferenceVideo15.value
    if (work.model && !restoringReferenceVideo) {
      if (!modelOptions.value.includes(work.model)) modelOptions.value = [work.model, ...modelOptions.value]
      selectedModel.value = work.model
    }
    if (restoringReferenceVideo) syncVideoModelForGenerationMethod()
    if (work.type === 'video') {
      videoResolution.value = historicalVideoResolution === '1080p' && !videoSupports1080p.value
        ? '720p'
        : historicalVideoResolution
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
    void generateFromCurrentSettings('重新生成')
  } finally {
    regeneratingWorkId.value = ''
  }
}

async function useOutputAsReference(output: string, work: CreatorHistoryItem, index: number) {
  if (referencingOutputKey.value) return
  referencingOutputKey.value = `${work.id}:${index}`
  try {
    let blob: Blob
    if (output.startsWith('data:')) {
      blob = imageDataUrlToBlob(output)
    } else if (isCrossOriginHttpURL(output)) {
      const key = findKeyForWork(work)
      if (!key) throw new Error('未找到图片对应的可用 Key')
      blob = await downloadCreatorImage(key.key, output)
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
    await addReferenceFiles([file])
    selectedWork.value = null
    restoreSettingsScroll()
    await nextTick()
    appStore.showSuccess('已将作品加入参考图，并带回当时的生成参数')
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
      aspectRatio: aspectRatio.value, resolution: videoResolution.value,
    }]
    selectedShotId.value = videoShots.value[0].id
    videoGenerationMethod.value = 'text'
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

function shouldShowResultParameters(work: CreatorHistoryItem) {
  if (work.status === 'pending') return false
  return work.outputs.length > 0 || (work.type === 'video' && Boolean(work.requestId))
}

function historyWorkTitle(work: CreatorHistoryItem) {
  const firstPrompt = workShotPrompts(work)[0] || work.prompt || '未命名作品'
  return isMultiShotVideo(work) ? `完整成片 · ${firstPrompt}` : firstPrompt
}

function resultDescription(work: CreatorHistoryItem, index: number) {
  return work.type === 'video' ? workShotPrompts(work)[index] || work.prompt : work.prompt
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

function shotDurationLabel(work: CreatorHistoryItem, index: number) {
  const duration = work.shotDurations?.[index]
  return duration ? `${duration} 秒` : '分段视频'
}

function workAspectRatio(work: CreatorHistoryItem, index?: number) {
  return index === undefined
    ? work.aspectRatio || '自动画幅'
    : work.shotAspectRatios?.[index] || work.aspectRatio || '自动画幅'
}

function shotGenerationMeta(work: CreatorHistoryItem, index: number) {
  const method = work.shotGenerationMethods?.[index] || work.videoGenerationMethod || 'text'
  const referenceCount = work.shotReferenceCounts?.[index] || 0
  return referenceCount
    ? `${videoGenerationMethodLabelFor(method)} · ${referenceCount} 张参考图`
    : videoGenerationMethodLabelFor(method)
}

function mergedDownloadName(work: CreatorHistoryItem) {
  return `creator-complete-${work.id}.mp4`
}

function resultMeta(work: CreatorHistoryItem) {
  return `${work.provider} · ${work.model} · ${work.aspectRatio || '自动画幅'} · ${workResolutionLabel(work)}`
}

function workResolutionLabel(work: CreatorHistoryItem, index?: number) {
  const resolution = index === undefined ? work.resolution : work.shotResolutions?.[index] || work.resolution
  if (!resolution) return '默认清晰度'
  const actualOutputSize = index === undefined || !isMultiShotVideo(work)
    ? work.actualOutputSize
    : work.shotActualOutputSizes?.[index]
  if (actualOutputSize) {
    const [width, height] = actualOutputSize.split('x').map(Number)
    const isGrok = work.imageCapability === 'grok' || /^grok-imagine/i.test(work.model)
    const actualTier = work.type === 'image' && !isGrok && width && height ? customImageResolution(width, height) : resolution
    return `${actualTier} · ${actualOutputSize.replace('x', '×')}`
  }
  if (work.outputSize) return `${resolution} · ${work.outputSize.replace('x', '×')}`
  return resolution
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
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(workAspectRatio(work, index))
  return match ? `${match[1]} / ${match[2]}` : work.type === 'video' ? '16 / 9' : '1 / 1'
}

function resultIsLandscape(work: CreatorHistoryItem) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(work.aspectRatio || '')
  return work.type === 'image' && !!match && Number(match[1]) > Number(match[2])
}

function resultMediaStyle(work: CreatorHistoryItem, index?: number) {
  if (work.type === 'video') {
    return {
      aspectRatio: resultAspectRatio(work, index),
      maxHeight: 'min(58vh, 620px)',
    }
  }
  return resultIsLandscape(work) ? { aspectRatio: resultAspectRatio(work) } : undefined
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

function detailedResultMeta(work: CreatorHistoryItem) {
  const parts = [work.provider, work.model, work.aspectRatio || '自动画幅', workResolutionLabel(work)]
  if (work.type === 'video') parts.push(`${work.shotCount || 1} 个镜头`, `${work.requestedDuration || 0} 秒`)
  parts.push(`${work.referenceCount || 0} 张参考图`)
  return parts.join(' · ')
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
    previewUrl.value = output
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
    const extension = work.type === 'video' ? 'mp4' : imageFileExtension(url)
    const filename = `creator-${Date.now()}-${index + 1}.${extension}`
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
      temporaryUrl = URL.createObjectURL(await downloadCreatorImage(key.key, url))
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
  } catch (error) {
    const message = errorMessage(error, '作品下载失败')
    appStore.showError(/failed to fetch|network error/i.test(message) ? '下载连接失败，请稍后重试' : message)
  } finally {
    if (downloadingOutputKey.value === outputKey) downloadingOutputKey.value = ''
  }
}

function isCrossOriginHttpURL(url: string) {
  if (!/^https?:\/\//i.test(url) || typeof window === 'undefined') return false
  const link = document.createElement('a')
  link.href = url
  return link.origin !== window.location.origin
}

function imageFileExtension(url: string) {
  const dataType = url.match(/^data:image\/(png|jpe?g|webp|gif|avif)(?:;|,)/i)?.[1]
  const pathType = url.split(/[?#]/, 1)[0].match(/\.(png|jpe?g|webp|gif|avif)$/i)?.[1]
  const type = (dataType || pathType || outputFormat.value || 'png').toLowerCase()
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

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('参考图读取失败'))
    reader.readAsDataURL(file)
  })
}

function delay(milliseconds: number) {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds))
}

watch([studioMode, imageCapability, selectedModel, selectedApiKey], loadImagePricing)
watch([studioMode, selectedModel, selectedApiKey], loadVideoPricing)

watch([studioMode, imageCapability], () => {
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
  if (!options.includes(videoResolution.value)) videoResolution.value = '720p'
  videoShots.value.forEach(shot => {
    if (!options.includes(shot.resolution)) shot.resolution = '720p'
  })
})

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

function activateStudio() {
  studioActive = true
  window.addEventListener('paste', handlePaste)
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
  stopTemplateAutoplay()
  imageSizeDialogOpen.value = false
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
.creator-studio {
  --creator-accent: #0f9f8f;
  --creator-accent-strong: #087f74;
  --creator-accent-soft: #e8faf6;
  --creator-line: #dfe8e7;
  --creator-muted: #738096;
  --creator-radius: 12px;
  --creator-radius-inner: 12px;
  --creator-surface-radius: 16px;
  --creator-radius-large: var(--creator-surface-radius);
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
.quick-templates,
.canvas-footnote {
  display: flex;
  align-items: center;
}

.studio-title { gap: 10px; font-size: 16px; font-weight: 700; }
.studio-title-icon { justify-content: center; width: 30px; height: 30px; color: var(--creator-accent-strong); background: var(--creator-accent-soft); border-radius: 7px; }

.mode-switch {
  display: grid;
  grid-template-columns: 1fr 1fr;
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
  border-radius: var(--creator-radius-large);
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
  border-radius: var(--creator-radius-inner);
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
.new-creation-link { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; padding: 0 12px; border: 1px solid #9cd9cf; border-radius: 10px; background: #effbf8; color: var(--creator-accent-strong); font-size: 12px; font-weight: 700; white-space: nowrap; }
.new-creation-link:hover { background: #dcf7ef; border-color: var(--creator-accent); }
.new-creation-link:focus-visible { outline: 2px solid var(--creator-accent); outline-offset: 3px; }
.generation-tasks { flex-shrink: 0; display: flex; align-items: center; gap: 8px; padding: 10px 20px; border-bottom: 1px solid var(--creator-line); overflow-x: auto; }
.generation-tasks-label { flex-shrink: 0; font-size: 12px; color: var(--creator-muted); }
.generation-task { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; max-width: 220px; padding: 8px 12px; border: 1px solid var(--creator-line); border-radius: 8px; font-size: 12px; color: var(--creator-accent-strong); }
.generation-task > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.generation-task .button-spinner { border-color: #c6e8df; border-top-color: var(--creator-accent); flex-shrink: 0; width: 12px; height: 12px; }
.generation-task.active, .generation-task:hover { background: var(--creator-accent-soft); border-color: var(--creator-accent); }
.generation-task:focus-visible { outline: 2px solid var(--creator-accent); outline-offset: 2px; }
.pending-image-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.generation-new-creation { min-height: 40px; gap: 8px; padding: 0 16px; border-color: var(--creator-accent); border-radius: var(--creator-radius-large); background: var(--creator-accent); color: #fff; font-size: 13px; font-weight: 600; box-shadow: 0 6px 16px rgb(15 159 143 / 20%); transition: background 150ms ease, border-color 150ms ease, box-shadow 150ms ease; }
.generation-new-creation:hover { border-color: var(--creator-accent-strong); background: var(--creator-accent-strong); box-shadow: 0 8px 20px rgb(15 159 143 / 25%); }
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
  border-radius: 11px;
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
  border-radius: 7px;
  color: #536176;
  background: #fff;
  transition: 150ms ease;
}
.icon-action:hover,
.collapse-action:hover,
.history-reopen:hover,
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
.history-collapsed .history-panel { display: none; }
.playground-history-reopen-button {
  width: auto;
  height: 34px;
  flex-shrink: 0;
  gap: 6px;
  padding: 0 10px;
  border-color: #dbe5e4;
  border-radius: 10px;
  color: #64748b;
  background: #fff;
  font-size: 12px;
  white-space: nowrap;
}
.playground-history-reopen-button:hover { border-color: #cce8e3; color: var(--creator-accent-strong); background: #edf9f7; }
.playground-history-reopen-icon { display: inline-grid; width: 16px; height: 16px; place-items: center; }
.playground-history-reopen-icon svg { width: 16px; height: 16px; }

.history-heading { gap: 10px; padding: 22px 18px 14px; }
.history-heading > div:first-child { min-width: 0; flex: 1; }
.history-heading h2,
.settings-heading h2 { margin: 0; color: #172033; font-size: 16px; font-weight: 750; }
.history-heading p,
.settings-heading p { margin: 3px 0 0; color: var(--creator-muted); font-size: 12px; }
.history-count { display: inline-grid; place-items: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 7px; color: #8794a8; background: #f1f5f8; font-size: 12px; font-weight: 700; }
.collapse-action { width: 34px; }
.history-tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin: 0 16px 14px; padding: 4px; border: 1px solid var(--creator-line); border-radius: 8px; background: #f2f7f6; }
.history-tabs button { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; border-radius: 6px; color: #8090a6; font-size: 12px; font-weight: 650; }
.history-tabs button.active { color: var(--creator-accent-strong); background: #fff; box-shadow: 0 2px 8px rgb(30 72 67 / 8%); }

.history-list { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 0 12px 18px; scrollbar-color: #c5cbd1 transparent; scrollbar-width: thin; }
.history-list::-webkit-scrollbar { width: 8px; }
.history-list::-webkit-scrollbar-track { background: transparent; }
.history-list::-webkit-scrollbar-thumb { border: 2px solid #fff; border-radius: 999px; background: #c5cbd1; }
.history-list::-webkit-scrollbar-thumb:hover { background: #9ba4ad; }
.history-item { position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr); align-items: center; gap: 10px; width: 100%; height: 70px; margin-bottom: 8px; padding: 8px; overflow: hidden; border: 1px solid #dce6e4; border-radius: 8px; text-align: left; background: #fff; box-shadow: 0 2px 8px rgb(29 61 57 / 4%); }
.history-item:hover { border-color: #a5ddd4; background: #f7fcfb; box-shadow: 0 6px 16px rgb(29 81 73 / 8%); }
.history-item.active { border-color: #6fddcc; background: #eefbf8; box-shadow: 0 5px 14px rgb(24 138 121 / 8%); }
.history-item-hitbox { position: absolute; z-index: 1; inset: 0; border-radius: inherit; }
.history-item-hitbox:focus-visible { outline: 2px solid #39b9a5; outline-offset: -3px; }
.history-preview { position: relative; display: grid; place-items: center; width: 52px; height: 52px; overflow: hidden; border-radius: 6px; color: #8da09e; background: #e8f0ef; }
.history-preview img,
.history-preview video { width: 100%; height: 100%; object-fit: cover; }
.history-status { position: absolute; right: 4px; bottom: 4px; width: 8px; height: 8px; border: 2px solid #fff; border-radius: 50%; }
.history-status.pending { background: #f0a63a; }
.history-status.failed { background: #d84b4b; }
.history-copy { min-width: 0; padding-right: 48px; align-self: center; }
.history-copy strong,
.history-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-copy strong { color: #344054; font-size: 12px; font-weight: 700; }
.history-copy small { margin-top: 5px; color: #95a1b2; font-size: 10px; }
.history-preview,
.history-copy { pointer-events: none; }
.history-item-actions { position: absolute; z-index: 2; top: 50%; right: 8px; display: flex; align-items: center; justify-content: flex-end; gap: 1px; opacity: 0; transform: translateY(-50%); pointer-events: none; transition: opacity 160ms ease; }
.history-item:hover .history-item-actions,
.history-item:focus-within .history-item-actions,
.history-item.active .history-item-actions { opacity: 1; pointer-events: auto; }
.history-item-actions button { display: grid; place-items: center; width: 23px; height: 28px; border-radius: 6px; color: #8295a4; }
.history-item-actions .history-delete { width: 28px; height: 28px; border-radius: 50%; }
.history-item-actions button:hover { color: var(--creator-accent-strong); background: rgb(255 255 255 / 78%); }
.history-item-actions .history-delete:hover { color: #cc5252; background: #fff1f1; }
.history-empty { display: grid; justify-items: center; padding: 90px 22px 30px; text-align: center; color: #92a0b3; }
.history-empty > span { display: grid; place-items: center; width: 58px; height: 58px; margin-bottom: 14px; border-radius: 8px; background: #f3f7f7; }
.history-empty strong { color: #58667a; font-size: 14px; }
.history-empty p { margin: 7px 0 0; font-size: 12px; }

.canvas-panel {
  position: relative;
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
.inspiration-workspace { max-width: 58rem; margin-inline: auto; padding: 46px 0 64px; }
.inspiration-intro { text-align: center; }
.inspiration-mark,
.generation-orbit { display: inline-grid; place-items: center; width: 68px; height: 68px; border: 1px solid #79e3d2; border-radius: 20px; color: var(--creator-accent-strong); background: #e8fbf7; }
.eyebrow { margin: 18px 0 10px; color: var(--creator-accent-strong); font-size: 10px; font-weight: 850; letter-spacing: 0; }
.inspiration-intro h2,
.generation-state h2,
.result-heading h2 { margin: 0; color: #172033; font-size: 23px; font-weight: 780; }
.inspiration-intro > p:last-child,
.generation-state > p:not(.eyebrow) { margin: 10px auto 0; color: #7a8799; font-size: 13px; line-height: 1.7; }

.featured-brief { margin-top: 22px; overflow: hidden; border: 1px solid #263c39; border-radius: var(--creator-surface-radius); color: #eaf1ef; background: #101d1b; box-shadow: 0 24px 48px rgb(20 45 41 / 18%); }
.brief-topline { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 12px; min-height: 60px; margin: 0 24px; border-bottom: 1px solid #2b3e3b; color: #9db3af; font-size: 11px; font-weight: 700; }
.brief-topline > span:first-child { display: flex; align-items: center; gap: 6px; color: #b5d8d1; }
.brief-topline > div { display: flex; gap: 7px; }
.brief-topline button { width: 32px; height: 32px; border-color: #334b47; color: #b9cbc7; background: #182825; }
.brief-stage { height: 256px; overflow: hidden; }
.brief-body { display: grid; grid-template-columns: minmax(0, .88fr) minmax(0, 1.12fr); height: 100%; min-height: 0; padding: 24px; }
.brief-summary { display: flex; flex-direction: column; align-items: flex-start; min-height: 0; padding-right: 24px; border-right: 1px solid #33423f; }
.brief-summary > span { display: inline-flex; padding: 5px 9px; border: 1px solid #9a7744; border-radius: 6px; color: #d6b374; background: #28251e; font-size: 10px; }
.brief-summary h3 { margin: 16px 0 7px; color: #fff; font-size: 28px; font-weight: 760; }
.brief-summary p { margin: 0; color: #a7b6b3; font-size: 12px; line-height: 1.7; }
.brief-summary small { display: block; margin-top: auto; padding-top: 16px; color: #788b87; font-size: 10px; }
.brief-copy { display: flex; align-items: flex-start; flex-direction: column; min-width: 0; min-height: 0; padding-left: 24px; }
.brief-copy > small { flex-shrink: 0; color: #c2d3cf; font-size: 10px; font-weight: 800; letter-spacing: 0; }
.brief-copy p { flex: 1; align-self: stretch; min-height: 0; overflow-y: auto; overflow-wrap: anywhere; scrollbar-width: thin; scrollbar-color: #5c716d transparent; margin: 14px 0; color: #d2dedb; font-size: 13px; line-height: 1.8; }
.brief-copy button { display: inline-flex; flex-shrink: 0; align-items: center; gap: 7px; min-height: 40px; padding: 0 14px; border-radius: 7px; color: #2f2b20; background: #dfba69; font-size: 12px; font-weight: 750; }
.brief-copy button:hover { background: #edcc82; }
.brief-slide-enter-active,
.brief-slide-leave-active { transition: opacity 220ms ease, transform 220ms ease; }
.brief-slide-enter-from { opacity: 0; transform: translateX(12px); }
.brief-slide-leave-to { opacity: 0; transform: translateX(-12px); }
.brief-navigation { display: flex; align-items: center; gap: 16px; min-height: 58px; padding: 12px 24px; border-top: 1px solid #263a36; background: rgb(255 255 255 / 2%); }
.brief-navigation > label { flex-shrink: 0; color: #9bb0aa; font-size: 11px; }
.brief-range { appearance: none; flex: 1; min-width: 0; height: 24px; margin: 0; padding: 0; border: 0; border-radius: 6px; background: transparent; cursor: pointer; }
.brief-range::-webkit-slider-runnable-track { height: 3px; border-radius: 3px; background: linear-gradient(to right, #dfba69 var(--brief-progress), #3b514c var(--brief-progress)); }
.brief-range::-moz-range-track { height: 3px; border-radius: 3px; background: linear-gradient(to right, #dfba69 var(--brief-progress), #3b514c var(--brief-progress)); }
.brief-range::-webkit-slider-thumb { appearance: none; width: 12px; height: 12px; margin-top: -4.5px; border: 2px solid #101d1b; border-radius: 50%; background: #dfba69; box-shadow: 0 0 0 1px rgb(223 186 105 / 35%); transition: box-shadow 150ms ease; }
.brief-range::-moz-range-thumb { width: 8px; height: 8px; border: 2px solid #101d1b; border-radius: 50%; background: #dfba69; box-shadow: 0 0 0 1px rgb(223 186 105 / 35%); }
.brief-range:hover::-webkit-slider-thumb { box-shadow: 0 0 0 4px rgb(223 186 105 / 14%); }
.brief-range:focus-visible { outline: 2px solid #dfba69; outline-offset: 4px; }
.brief-position { display: inline-flex; flex-shrink: 0; align-items: center; gap: 6px; min-width: 64px; justify-content: center; padding: 5px 8px; border: 1px solid #354a44; border-radius: 8px; background: #192b25; font-size: 11px; font-variant-numeric: tabular-nums; }
.brief-position strong { color: #dfba69; font-weight: 650; }
.brief-position > span { color: #91a59e; }
.quick-templates { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; margin-top: 16px; }
.quick-templates > span { grid-column: 1 / -1; color: #93a0b0; font-size: 11px; }
.quick-templates button { display: inline-flex; align-items: center; justify-content: space-between; gap: 5px; min-width: 0; min-height: 34px; padding: 0 11px; border: 1px solid #d7e5e2; border-radius: 7px; color: #52716d; background: #fff; font-size: 11px; font-weight: 650; }
.quick-templates button > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.quick-templates button > svg { flex-shrink: 0; }
.quick-templates button:hover { border-color: #93d9ce; color: var(--creator-accent-strong); }

.generation-state { display: grid; grid-template-columns: minmax(0, 1fr); justify-items: center; row-gap: 16px; padding-block: 24px; text-align: center; }
.generation-state > p:not(.eyebrow) { margin: 0; }
.generation-orbit { position: relative; width: 76px; height: 76px; margin-bottom: 0; border-radius: 50%; animation: creatorPulse 2.2s ease-in-out infinite; }
.generation-orbit::before { position: absolute; inset: 8px; border: 1px solid #9ee8dc; border-radius: 16px; background: #edfcf8; content: ''; }
.generation-orbit::after { position: absolute; inset: -5px; border: 2px solid #a9f0e4; border-right-color: var(--creator-accent-strong); border-radius: 50%; content: ''; animation: creatorSpin 2.4s linear infinite; }
.generation-orbit > svg { position: relative; z-index: 1; }
.generation-metrics { display: flex; align-items: center; gap: 10px; min-height: 30px; margin: 0; color: var(--creator-accent-strong); font-size: 12px; font-weight: 700; }
.generation-metrics > span,
.generation-metrics > strong { display: inline-flex; align-items: center; height: 30px; line-height: 1; }
.generation-metrics strong { font-size: 14px; font-variant-numeric: tabular-nums; }
.generation-percent { justify-content: center; min-width: 42px; padding: 0 10px; border-radius: 999px; color: var(--creator-accent-strong); background: #d8f8f1; text-align: center; }
.progress-track { width: min(420px, 82%); height: 4px; margin: 0; overflow: hidden; border-radius: 4px; background: #d9f5ef; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--creator-accent-strong); transition: width .6s ease; }
.progress-track.indeterminate span { width: 34%; animation: creatorProgress 1.7s ease-in-out infinite; }
.generation-note { display: grid; max-width: min(320px, 100%); margin: 0; color: #82938f; font-size: 11px; font-weight: 400; line-height: 1.7; overflow-wrap: anywhere; text-wrap: pretty; }
.result-workspace { padding: 32px 0 24px; }
.result-heading { align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.result-heading > div { min-width: 0; }
.result-heading .eyebrow { margin: 0 0 4px; font-weight: 600; }
.result-heading > div > p:last-child { display: -webkit-box; max-width: 650px; margin: 5px 0 0; overflow: hidden; color: #778498; font-size: 12px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.result-heading-complete { align-items: flex-start; flex-wrap: wrap; }
.result-heading-complete > div:first-child { flex: 1 1 240px; }
.result-heading h2 { font-size: 20px; font-weight: 700; line-height: 1.4; }
.result-heading-actions { display: flex; flex: 0 1 auto; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; margin-left: auto; }
.result-count-pill { display: inline-flex; align-items: center; min-height: 34px; padding: 0 10px; border: 1px solid #d6e4e1; border-radius: var(--creator-radius); white-space: nowrap; color: #728093; background: #fff; font-size: 11px; }
.result-heading-actions .secondary-command { min-height: 34px; padding: 0 12px; flex-shrink: 0; white-space: nowrap; font-weight: 600; border-color: #d6e4e1; color: #3f5d59; }
.result-heading-actions .icon-action { flex-shrink: 0; width: 34px; height: 34px; }
.result-heading-actions .primary-soft { border-color: var(--creator-accent); color: #fff; background: var(--creator-accent); }
.result-heading-actions .primary-soft:hover { border-color: var(--creator-accent-strong); background: var(--creator-accent-strong); }
.complete-video-card { overflow: hidden; margin-bottom: 24px; border: 1px solid #cadbd8; border-radius: var(--creator-radius); background: rgb(255 255 255 / 84%); box-shadow: 0 12px 30px rgb(25 74 67 / 10%); }
.complete-video-card > header { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-bottom: 1px solid #dce7e5; }
.complete-video-card > header > div { min-width: 0; }
.complete-video-card > header .eyebrow { margin: 0 0 4px; font-weight: 600; }
.complete-video-card > header h3 { margin: 0; color: #172033; font-size: 16px; font-weight: 700; line-height: 1.4; }
.complete-video-card > header p:last-child { display: -webkit-box; max-width: 650px; margin: 5px 0 0; font-weight: 400; overflow: hidden; color: #718094; font-size: 11px; line-height: 1.65; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.complete-video-card > header > span { flex: 0 0 auto; padding: 7px 11px; border: 1px solid #d4e3e0; border-radius: var(--creator-radius); white-space: nowrap; color: #5d716d; background: #f7faf9; font-size: 10px; }
.complete-video-frame,
.video-result-frame { position: relative; width: 100%; overflow: hidden; background: #101b1a; }
.complete-video-frame { display: grid; width: calc(100% - 32px); margin: 16px 16px 0; border-radius: inherit; max-height: min(58vh, 620px); }
.video-result-frame { display: grid; border-radius: inherit; max-height: min(58vh, 620px); }
.video-loading-overlay,
.video-loading-media { color: #dcebe8; background: #142321; }
.video-loading-media { display: grid; height: auto; }
.video-loading-overlay { position: absolute; z-index: 2; inset: 0; display: grid; justify-items: center; align-content: center; padding: 24px; text-align: center; }
.video-loading-overlay strong,
.video-loading-content strong { margin-top: 13px; color: #f1f8f6; font-size: 14px; font-weight: 700; }
.video-loading-overlay p,
.video-loading-content p { margin: 7px 0 0; color: #9bb4af; font-size: 11px; line-height: 1.5; }
.video-loading-content { display: grid; justify-items: center; align-content: center; width: 100%; height: 100%; }
.video-loading-spinner { display: inline-grid; width: 42px; height: 42px; place-items: center; border: 2px solid rgb(146 224 211 / 28%); border-top-color: #79dfd0; border-radius: 50%; color: #9cebe0; animation: creatorSpin 900ms linear infinite; }
.video-loading-spinner svg { width: 18px; height: 18px; }
.video-loading-grid { margin-bottom: 24px; }
.video-loading-card { box-shadow: 0 12px 30px rgb(25 74 67 / 10%); }
.video-loading-actions { min-height: 76px; }
.complete-video-card > footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 66px; padding: 10px 12px 10px 18px; }
.complete-video-card > footer div { min-width: 0; }
.complete-video-card > footer strong,
.complete-video-card > footer span { display: block; }
.complete-video-card > footer strong { color: var(--creator-accent-strong); font-size: 12px; }
.complete-video-card > footer span { overflow: hidden; margin-top: 5px; color: #8795a7; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
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
.result-index { position: absolute; z-index: 2; top: 12px; left: 12px; display: grid; place-items: center; min-width: 28px; height: 25px; padding: 0 7px; border-radius: 6px; color: #fff; background: rgb(28 39 52 / 62%); font-size: 10px; font-weight: 800; backdrop-filter: blur(5px); }
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
.result-actions { justify-content: space-between; gap: 16px; min-height: 76px; padding: 11px 10px 11px 14px; color: #64748b; font-size: 13px; }
.result-description { min-width: 0; flex: 1; }
.result-description strong { color: var(--creator-accent-strong); font-size: 14px; }
.result-description span { margin-left: 6px; color: #718096; font-size: 12px; }
.result-description p { overflow: hidden; margin: 7px 0 0; color: #526176; font-size: 13px; line-height: 1.55; text-overflow: ellipsis; white-space: nowrap; }
.result-segment-grid .result-description p { display: -webkit-box; line-height: 1.45; text-overflow: initial; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.result-media-actions { display: flex; flex: 0 0 auto; gap: 6px; }
.result-workspace .icon-action,
.result-workspace .secondary-command { border-radius: var(--creator-radius); }
.result-media-actions .icon-action { width: 32px; height: 32px; }
.result-error { display: grid; justify-items: center; padding: 80px 24px; border: 1px dashed #e7b4ae; border-radius: 8px; color: #b64b42; background: #fff8f7; text-align: center; }
.result-error strong { margin-top: 14px; color: #7b312b; }
.result-error p { margin: 7px 0 18px; color: #98635e; font-size: 12px; }
.result-error.muted { border-color: #cbdad7; color: #758a87; background: #f5f9f8; }
.result-error.muted strong { color: #4c615e; }
.result-error.muted p { color: #7d8c8a; }
.status-check-icon { animation: creatorSpin .85s linear infinite; }
.status-check-command { display: inline-flex; align-items: center; gap: 7px; border-color: #8eddd0; color: var(--creator-accent-strong); background: #effbf8; }
.status-check-command:disabled { cursor: wait; opacity: .68; }
.video-status-feedback { display: flex; align-items: flex-start; gap: 7px; width: min(460px, 100%); margin-top: 13px; padding: 10px 12px; border: 1px solid #cce4df; border-radius: 7px; color: #52706b; background: #fff; font-size: 11px; line-height: 1.6; text-align: left; }
.video-status-feedback svg { flex: 0 0 auto; margin-top: 2px; }
.video-status-feedback.is-error { border-color: #edc5c0; color: #9a4b43; background: #fff9f8; }
.result-parameters { margin-top: 14px; }
.result-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.result-card,
.result-stat-grid article { border-radius: var(--creator-radius); }
.result-stat-grid article { min-width: 0; min-height: 78px; padding: 14px; border: 1px solid #d6e2e0; background: rgb(255 255 255 / 72%); }
.result-stat-grid span,
.result-parameter-details div > span { display: block; color: #64748b; font-size: 10px; }
.result-stat-grid strong { display: block; overflow: hidden; margin-top: 8px; color: #263549; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.result-parameter-details { margin-top: 9px; overflow: hidden; border: 1px solid #d6e2e0; border-radius: var(--creator-radius); background: rgb(255 255 255 / 72%); }
.result-parameter-details summary { display: flex; align-items: center; justify-content: space-between; min-height: 50px; padding: 0 16px; color: #526176; font-size: 12px; cursor: pointer; list-style: none; }
.result-parameter-details summary::-webkit-details-marker { display: none; }
.result-parameter-details summary svg { color: var(--creator-accent-strong); transition: transform 160ms ease; }
.result-parameter-details[open] summary svg { transform: rotate(180deg); }
.result-parameter-details[open] summary { border-bottom: 1px solid #e2e9e8; }
.result-parameter-details > div { padding: 15px 16px 0; }
.result-parameter-details > div:last-child { padding-bottom: 17px; }
.result-parameter-details p { margin: 7px 0 0; color: #334155; font-size: 12px; line-height: 1.75; }
.result-parameter-details .full-prompt { white-space: pre-wrap; }
.secondary-command { min-height: 38px; padding: 0 14px; border: 1px solid #d8b3ad; border-radius: 7px; background: #fff; font-size: 12px; font-weight: 700; }
.canvas-footnote { flex: 0 0 auto; gap: 6px; margin: 0 24px 14px; padding-top: 12px; border-top: 1px solid #dce8e5; color: #9aa8b8; font-size: 10px; }

.professional-workspace { align-self: stretch; margin-top: 28px; margin-bottom: 70px; padding: 18px; border: 1px solid #d4e2df; border-radius: var(--creator-radius-large); background: rgb(255 255 255 / 76%); box-shadow: 0 14px 32px rgb(36 78 72 / 8%); }
.sequence-shot { cursor: pointer; }
.sequence-shot.active { border-color: #55d4c2; background: #f0fcf9; box-shadow: 0 7px 18px rgb(24 138 121 / 10%); }
.sequence-shot:focus-visible { outline: 2px solid #39b9a5; outline-offset: 2px; }
.sequence-shot.active .sequence-shot-index { border-color: #0f9f8f; color: #fff; background: #0f9f8f; }
.sequence-header { display: grid; grid-template-columns: minmax(0, 1fr) auto 38px; align-items: center; gap: 18px; padding-bottom: 14px; border-bottom: 1px solid #dce8e5; }
.sequence-eyebrow { display: flex; align-items: center; gap: 6px; margin: 0 0 7px; color: var(--creator-accent-strong); font-size: 8px; font-weight: 850; }
.sequence-eyebrow i { width: 7px; height: 7px; border-radius: 50%; background: #39d6bd; box-shadow: 0 0 0 4px #e0faf5; }
.sequence-header h2 { display: flex; align-items: center; gap: 10px; margin: 0; color: #1f2d3d; font-size: 16px; font-weight: 780; }
.sequence-header h2 span { display: inline-flex; min-height: 28px; align-items: center; padding: 0 10px; border: 1px solid #b9e1da; border-radius: 7px; color: var(--creator-accent-strong); background: #effbf8; font-size: 10px; font-weight: 750; font-variant-numeric: tabular-nums; }
.sequence-header > div:first-child > p:last-child { margin: 5px 0 0; color: #8a98aa; font-size: 9px; }
.sequence-header dl { display: flex; margin: 0; }
.sequence-header dl > div { min-width: 76px; padding: 0 15px; border-left: 1px solid #dae5e3; }
.sequence-header dt { color: #91a0b2; font-size: 8px; }
.sequence-header dd { margin: 5px 0 0; color: #273548; font-size: 12px; font-weight: 750; font-variant-numeric: tabular-nums; }
.sequence-add { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid #92e3d5; border-radius: var(--creator-radius); color: var(--creator-accent-strong); background: #edfcf9; }
.sequence-ruler { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; margin: 12px 0 8px; color: #8fa0b4; font-size: 8px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sequence-ruler i { height: 1px; background: repeating-linear-gradient(90deg, #b9d6d1 0 1px, transparent 1px 22%); border-bottom: 1px solid #d4e3e0; }
.sequence-track { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 2px 2px 8px; }
.sequence-shot { position: relative; display: grid; grid-template-columns: 76px minmax(0, 1fr); width: 100%; gap: 10px; min-height: 132px; padding: 10px 9px 9px 50px; border: 1px solid #d6e3e1; border-radius: var(--creator-radius); background: #fff; }
.sequence-shot::before { position: absolute; top: 39px; bottom: 10px; left: 28px; width: 1px; background: #d9e8e5; content: ''; }
.sequence-shot-index { position: absolute; top: 10px; left: 13px; display: grid; place-items: center; width: 29px; height: 24px; border: 1px solid #b9e1da; border-radius: 6px; color: var(--creator-accent-strong); background: #effbf8; font-size: 9px; font-weight: 800; }
.sequence-shot-preview { position: relative; display: grid; place-items: center; min-height: 88px; overflow: hidden; border: 1px solid #d6e4e1; border-radius: var(--creator-radius-inner); color: var(--creator-accent-strong); background: linear-gradient(135deg, #e8f6f3, #f7fbfa); }
.sequence-shot-preview::before { position: absolute; top: 11px; left: 10px; width: 38px; height: 15px; border-top: 1px solid #bddbd5; border-left: 1px solid #bddbd5; transform: skewX(-28deg); content: ''; }
.sequence-shot-preview > span { position: relative; display: grid; z-index: 1; place-items: center; width: 34px; height: 34px; border: 1px solid #73dac9; border-radius: 50%; background: #dff9f4; }
.sequence-shot-preview small { position: absolute; right: 7px; bottom: 6px; color: #68867f; font-size: 7px; font-weight: 750; font-variant-numeric: tabular-nums; }
.sequence-shot-content { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.sequence-shot-content > header { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; min-height: 24px; }
.sequence-shot-content > header > strong { color: #64748b; font-size: 8px; }
.sequence-shot-content > header > span { display: flex; align-items: center; gap: 3px; color: #91a0b2; font-size: 7px; }
.sequence-shot-content > header > span i { width: 5px; height: 5px; border-radius: 50%; background: #c4d0d8; }
.sequence-shot-content > header > div { display: flex; gap: 1px; margin-left: auto; }
.sequence-shot-content > header button { display: grid; place-items: center; width: 21px; height: 21px; border-radius: 5px; color: #718096; }
.sequence-shot-content > header button:hover:not(:disabled) { color: var(--creator-accent-strong); background: #eff9f7; }
.sequence-shot-content > header button:disabled { opacity: .25; }
.sequence-shot-prompt { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; flex: none; margin: 0; padding: 0; overflow: hidden; white-space: pre-wrap; overflow-wrap: anywhere; color: #344054; font-size: 10px; line-height: 1.5; }
.sequence-shot-prompt.empty { color: #a7b3c0; }
.sequence-shot-content footer { display: flex; flex-shrink: 0; margin-top: auto; flex-wrap: wrap; align-items: center; gap: 4px; }
.sequence-shot-content footer > span { padding: 3px 5px; border: 1px solid #d7e5e2; border-radius: 5px; color: #607b76; background: #f5faf9; font-size: 7px; }
.sequence-inline-add { display: flex; grid-column: 1 / -1; width: 100%; min-height: 52px; align-items: center; justify-content: center; gap: 7px; border: 1px dashed #9ccfc6; border-radius: var(--creator-radius); color: var(--creator-accent-strong); background: #f3fbf9; font-size: 9px; font-weight: 700; }
.sequence-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 11px; padding-top: 11px; border-top: 1px solid #dce8e5; color: #73869a; font-size: 8px; }
.sequence-footer > span { display: flex; align-items: center; gap: 5px; }
.sequence-footer strong { color: #6f8092; font-size: 8px; }
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
.capability-switch { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 3px; margin-bottom: 20px; padding: 4px; border: 1px solid #d8e4e2; border-radius: 8px; background: #eff5f4; }
.capability-switch button { min-height: 45px; border-radius: inherit; color: #6e7e93; font-size: 12px; font-weight: 700; white-space: nowrap; }
.capability-switch button.active { color: var(--creator-accent-strong); background: #fff; box-shadow: 0 3px 12px rgb(26 76 70 / 9%); }
.online-dot { display: inline-block; width: 7px; height: 7px; margin-left: 4px; border-radius: 50%; background: #0db884; }
.video-capability-card { display: flex; align-items: center; gap: 11px; min-height: 62px; margin-bottom: 18px; padding: 9px 12px; border: 1px solid #9ee6da; border-radius: var(--creator-radius); background: #f2fcf9; }
.video-capability-icon { display: grid; flex: 0 0 36px; place-items: center; width: 36px; height: 36px; border-radius: var(--creator-radius-inner); color: var(--creator-accent-strong); background: #cff8ef; }
.video-capability-card strong,
.video-capability-card small { display: block; }
.video-capability-card strong { color: #263548; font-size: 13px; font-weight: 750; }
.video-capability-card small { margin-top: 4px; color: #7f8da0; font-size: 10px; }
.field-block { margin-bottom: 16px; }
.field-block > label,
.field-row label { display: block; margin-bottom: 7px; color: #4b5b70; font-size: 12px; font-weight: 750; }
.field-block > small,
.field-row small { display: block; margin-top: 6px; color: #8492a6; font-size: 10px; line-height: 1.5; }
.creator-field-hint { color: var(--creator-accent-strong) !important; }
.studio-input { width: 100%; min-height: 42px; padding: 0 12px; border: 1px solid #d7e0e7; border-radius: 8px; outline: none; color: #1b2638; background: #fff; font-size: 12px; transition: 150ms ease; }
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
.image-size-mode-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; margin-bottom: 22px; padding: 5px; border-radius: 16px; background: #eef4f3; }
.image-size-mode-tabs button { min-height: 46px; border-radius: 12px; color: #68788e; font-size: 13px; font-weight: 750; }
.image-size-mode-tabs button.active { color: #172236; background: #fff; box-shadow: 0 4px 14px rgb(25 58 54 / 9%); }
.image-size-section + .image-size-section { margin-top: 20px; }
.image-size-section h4,
.image-custom-size h4 { margin: 0 0 10px; color: #8796a9; font-size: 12px; font-weight: 750; }
.image-resolution-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 9px; }
.image-resolution-grid button { min-height: 50px; border: 1px solid #d8e2e1; border-radius: 14px; color: #65758a; background: #fff; font-size: 14px; font-weight: 800; transition: 150ms ease; }
.image-resolution-grid button.active { border-color: #3ad5c0; color: #087f74; background: #effbf8; }
.image-ratio-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 9px; }
.image-ratio-grid button { display: grid; min-height: 80px; place-items: center; align-content: center; gap: 7px; border: 1px solid #d8e2e8; border-radius: 14px; color: #66768c; background: #fff; font-size: 12px; font-weight: 750; transition: 150ms ease; }
.image-ratio-grid button:disabled { opacity: .4; cursor: not-allowed; }
.image-size-tier-hint { margin-top: 10px; color: #66768c; font-size: 12px; line-height: 1.6; }
.image-ratio-grid button i { display: block; box-sizing: border-box; border: 2px solid #95a4b7; border-radius: 3px; }
.image-ratio-grid button.active { border-color: #3ad5c0; color: #087f74; background: #effbf8; }
.image-ratio-grid button.active i { border-color: #4f9e94; }
.custom-ratio-command { width: 100%; min-height: 42px; margin-top: 10px; border: 1px solid #d8e3e1; border-radius: 14px; color: #6a7a8e; background: #fff; font-size: 12px; font-weight: 700; }
.image-size-auto-panel { display: grid; min-height: 280px; place-items: center; align-content: center; gap: 12px; text-align: center; }
.image-size-auto-panel > span { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 20px; color: #087f74; background: #e7f8f5; }
.image-size-auto-panel strong { color: #334155; font-size: 15px; }
.image-size-auto-panel p { max-width: 330px; margin: 0; color: #93a2b5; font-size: 12px; line-height: 1.7; }
.image-custom-size > div { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: end; gap: 12px; }
.image-custom-size label { color: #607087; font-size: 12px; font-weight: 700; }
.image-custom-size input { width: 100%; min-height: 50px; margin-top: 8px; padding: 0 14px; border: 1px solid #d7e0e7; border-radius: 14px; outline: 0; color: #314057; background: #fff; font-size: 14px; }
.image-custom-size > div > span { padding-bottom: 15px; color: #a1afbf; font-weight: 800; }
.image-custom-size > p { margin: 14px 0 0; padding: 13px 15px; border: 1px solid #d8e8e4; border-radius: 14px; color: #64758b; background: #f6faf9; font-size: 11px; line-height: 1.75; }
.image-size-result { margin-top: 22px; padding: 17px 18px; border-radius: 16px; background: #f4f8f7; }
.image-size-result span,
.image-size-result strong { display: block; }
.image-size-result span { color: #92a0b2; font-size: 11px; }
.image-size-result strong { margin-top: 7px; color: #152136; font-size: 18px; font-variant-numeric: tabular-nums; }
.image-size-cancel,
.image-size-confirm { min-width: 0; min-height: 48px; flex: 1; border-radius: 14px; font-size: 14px; font-weight: 750; transition: 150ms ease; }
.image-size-cancel { color: #687990; background: #f1f5f9; }
.image-size-confirm { color: #fff; background: #087f74; }
.image-size-cancel:hover { color: #45566c; background: #e8eef4; }
.image-size-confirm:hover { background: #066d64; box-shadow: 0 8px 18px rgb(8 127 116 / 20%); }
.key-ready { gap: 9px; min-height: 62px; margin-bottom: 18px; padding: 10px 12px; border: 1px solid #9ce2bf; border-radius: 8px; color: #27835c; background: #f0fcf5; }
.key-ready > div { min-width: 0; flex: 1; }
.key-ready strong,
.key-ready span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.key-ready strong { color: #256c4e; font-size: 12px; }
.key-ready span { margin-top: 3px; color: #67917c; font-size: 10px; }
.key-ready > small { color: #779488; font-size: 10px; }
.key-needed { margin-bottom: 18px; padding: 14px; border: 1px solid #eecf67; border-radius: 8px; background: #fffbed; }
.key-needed-title { align-items: flex-start; gap: 12px; }
.key-needed-title > span { display: grid; flex: 0 0 42px; place-items: center; width: 42px; height: 42px; border-radius: 8px; color: var(--creator-accent-strong); background: #fff; }
.key-needed-title strong { font-size: 13px; }
.key-needed-title p { margin: 4px 0; color: #7c8799; font-size: 12px; }
.key-needed-title small { color: #9ba5b4; font-size: 10px; }
.key-needed > button,
.generate-button { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; min-height: 46px; margin-top: 13px; border-radius: 8px; color: #fff; background: var(--creator-accent); font-size: 13px; font-weight: 750; box-shadow: 0 5px 12px rgb(15 159 143 / 18%); transition: 150ms ease; }
.key-needed > button:hover,
.generate-button:hover { background: var(--creator-accent-strong); }
.key-needed > button:disabled,
.generate-button:disabled { cursor: not-allowed; box-shadow: none; opacity: .45; }
.generation-requirement { margin: 10px 0 0; padding: 10px 12px; border: 1px solid #f2c14e; border-radius: 8px; color: #9a6200; background: #fffaf0; font-size: 11px; font-weight: 700; text-align: center; }
.settings-scroll hr { margin: 17px 0; border: 0; border-top: 1px solid var(--creator-line); }
.prompt-tool { display: block; width: 100%; margin-bottom: 18px; padding: 10px; border: 1px solid #d4e3e0; border-radius: 8px; text-align: left; background: #fbfdfd; }
.prompt-tool > header { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 9px; }
.prompt-tool.expanded > header { padding-bottom: 9px; border-bottom: 1px solid #e4eceb; }
.prompt-tool > header > span:first-child { display: grid; place-items: center; width: 36px; height: 36px; border: 1px solid #8ae6d6; border-radius: 7px; color: var(--creator-accent-strong); background: #ecfcf8; }
.prompt-tool header strong,
.prompt-tool header small { display: block; }
.prompt-tool header strong { color: #223044; font-size: 12px; }
.prompt-tool header small { overflow: hidden; margin-top: 3px; color: #8190a2; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.prompt-tool-controls { display: flex; align-items: center; gap: 6px; }
.prompt-page-actions { display: flex; align-items: center; gap: 4px; color: #7f8da0; font-size: 9px; font-variant-numeric: tabular-nums; }
.prompt-page-actions button { display: grid; place-items: center; width: 26px; height: 26px; border: 1px solid #d4e1df; border-radius: 6px; color: #52716d; background: #fff; }
.prompt-page-actions button:hover:not(:disabled) { border-color: #8edacd; color: var(--creator-accent-strong); }
.prompt-page-actions button:disabled { opacity: .35; }
.prompt-toggle { min-height: 30px; padding: 0 10px; border: 1px solid #cddddd; border-radius: var(--creator-radius-inner); color: var(--creator-accent-strong); background: #fff; font-size: 10px; font-weight: 700; white-space: nowrap; }
.prompt-toggle:hover { border-color: #8edacd; background: #f2fbf9; }
.prompt-template-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; padding-top: 9px; }
.prompt-template-grid button { min-width: 0; min-height: 48px; padding: 8px 9px; border: 1px solid #dce5eb; border-radius: 7px; text-align: left; background: #fff; transition: 150ms ease; }
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
.video-duration-estimate { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 54px; margin: -2px 0 16px; padding: 0 13px; border: 1px solid #d4e3e0; border-radius: 8px; background: #f8fcfb; }
.video-duration-estimate span { color: #65758a; font-size: 12px; font-weight: 700; }
.video-duration-estimate strong { margin-left: 5px; color: var(--creator-accent-strong); font-size: 14px; }
.video-duration-estimate small { color: #8c9bae; font-size: 10px; font-weight: 650; white-space: nowrap; }
.inline-command { display: inline-flex; align-items: center; gap: 5px; color: #59687b; font-size: 11px; font-weight: 650; }
.inline-command:hover { color: var(--creator-accent-strong); }
.upload-zone { display: grid; justify-items: center; width: 100%; min-height: 112px; padding: 15px; border: 1px dashed #b9cad7; border-radius: 8px; color: #8a9bb0; background: #fafcfd; }
.upload-zone:hover,
.upload-zone.dragging { border-color: #53cdb9; color: var(--creator-accent-strong); background: #f1fbf8; }
.upload-zone strong { margin-top: 7px; color: #5c6b7f; font-size: 11px; }
.upload-zone span { margin-top: 4px; font-size: 9px; }
.reference-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin-top: 8px; }
.reference-item { position: relative; aspect-ratio: 1; overflow: hidden; border: 1px solid #d8e2e7; border-radius: 7px; background: #edf2f3; }
.reference-item img { width: 100%; height: 100%; object-fit: cover; }
.reference-item button { position: absolute; top: 4px; right: 4px; width: 22px; height: 22px; border: 0; color: #fff; background: rgb(22 30 42 / 70%); }
.history-reference-note { margin: 8px 0 0; color: #8a98aa; font-size: 10px; line-height: 1.5; }
.two-column-fields,
.advanced-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.advanced-grid { grid-template-columns: minmax(0, 1fr); margin-bottom: 16px; padding: 12px; border: 1px solid #e0e7eb; border-radius: 8px; background: #f8fafb; }
.advanced-grid .field-block { margin-bottom: 0; }
.advanced-grid .field-block.wide { grid-column: 1 / -1; }
.stepper { min-height: 44px; border: 1px solid #d7e0e7; border-radius: 8px; overflow: hidden; }
.stepper button { display: grid; place-items: center; width: 46px; height: 42px; color: var(--creator-accent-strong); background: #fff; }
.stepper button:first-child { border-right: 1px solid #e0e6eb; }
.stepper button:last-child { border-left: 1px solid #e0e6eb; }
.stepper button:disabled { color: #c2cbd5; }
.stepper strong { flex: 1; text-align: center; color: #455267; font-size: 13px; }
.toggle-row { position: relative; justify-content: space-between; gap: 12px; margin-bottom: 16px; padding: 12px; border: 1px solid #dbe5e3; border-radius: 8px; background: #f8fbfa; cursor: pointer; }
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
.professional-toggle { display: grid; grid-template-columns: 24px max-content minmax(0, 1fr) 16px; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid #cbd8e8; border-radius: 8px; background: #fafbfe; box-shadow: none; }
.professional-toggle-icon { display: grid; grid-column: 1; place-items: center; width: 24px; height: 24px; border-radius: 8px; color: #6f86a6; background: #dceaff; }
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

/* Keep panels and controls on one corner system while preserving circular status UI. */
.history-item,
.history-empty > span,
.result-error,
.capability-switch,
.studio-input,
.key-ready,
.key-needed,
.prompt-tool,
  .upload-zone,
  .advanced-grid,
  .stepper,
  .toggle-row,
  .generate-button { border-radius: var(--creator-radius); }

.mode-switch,
.mode-option,
.mode-option-icon,
.history-tabs,
.history-tabs button { border-radius: var(--creator-radius-large); }

.studio-title-icon,
.connection-action,
.icon-action,
.collapse-action,
.history-reopen,
.history-count,
.history-preview,
.history-item-actions button,
.brief-topline button,
.brief-copy button,
.quick-templates button,
.secondary-command,
.key-needed > button,
.key-needed-title > span,
.prompt-tool > header > span:first-child,
.prompt-page-actions button,
.prompt-toggle,
.prompt-template-grid button,
.reference-item,
.reference-item button,
.sequence-add,
.sequence-inline-add,
.sequence-shot header button { border-radius: var(--creator-radius-inner); }

.settings-heading > svg { width: 16px; height: 16px; }

.modal-backdrop { position: fixed; z-index: 70; inset: 0; display: grid; place-items: center; padding: 24px; background: rgb(15 23 42 / 58%); backdrop-filter: blur(5px); }
.image-preview { z-index: 80; background: rgb(15 23 42 / 80%); }
.image-preview-content { --creator-image-background: transparent; --creator-image-text: #dce8e5; width: calc(100vw - 48px); height: calc(100dvh - 96px); max-width: 1600px; border-radius: 12px; }
.preview-close { position: fixed; top: 18px; right: 18px; border-color: rgb(255 255 255 / 30%); color: #fff; background: rgb(17 24 39 / 75%); }

@keyframes creatorSpin { to { transform: rotate(360deg); } }
@keyframes creatorPulse { 50% { transform: scale(1.04); box-shadow: 0 0 0 12px rgb(41 185 164 / 6%); } }
@keyframes creatorStatusPulse { to { opacity: .35; transform: scale(.92); } }
@keyframes creatorProgress {
  0% { transform: translateX(-105%); }
  50% { transform: translateX(95%); }
  100% { transform: translateX(295%); }
}

:global(.dark) .creator-studio { --creator-line: #30413f; color: #e7efed; }
:global(.dark) .studio-toolbar,
:global(.dark) .history-panel,
:global(.dark) .settings-panel { background: #111b1a; }
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
:global(.dark) .mode-option-icon { border-color: #3c504d; color: #aab9b6; background: #1b2927; }
:global(.dark) .mode-option-image.active .mode-option-icon { border-color: #39776d; color: #71d9c9; background: #18332f; }
:global(.dark) .mode-option-video.active .mode-option-icon { border-color: #355f9e; color: #75a7ff; background: #172b49; }
:global(.dark) .video-capability-card { border-color: #347a6f; background: #15302c; }
:global(.dark) .video-capability-card strong { color: #e5efed; }
:global(.dark) .video-capability-card small { color: #91a49f; }
:global(.dark) .ready-status { border-color: #26745d; color: #71dab5; background: #142b24; }
:global(.dark) .connection-action { color: #b8c7c4; }
:global(.dark) .connection-action:hover { color: #7de0d1; background: #1b312e; box-shadow: inset 0 0 0 1px #35514c; }
:global(.dark) .icon-action,
:global(.dark) .collapse-action,
:global(.dark) .studio-input,
:global(.dark) .stepper,
:global(.dark) .stepper button { border-color: #354643; color: #c3cfcc; background: #172321; }
:global(.dark) .playground-history-reopen-button { border-color: #354643; color: #9aafa9; background: #172321; }
:global(.dark) .playground-history-reopen-button:hover { border-color: #354643; color: #83ddd0; background: #18332f; }
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
:global(.dark) .history-item { border-color: #354643; background: #131f1d; box-shadow: none; }
:global(.dark) .history-item.active { border-color: #357f74; background: #17322e; }
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
:global(.dark) .result-parameter-details,
:global(.dark) .sequence-shot { border-color: #334642; background: #14211f; }
:global(.dark) .sequence-header h2,
:global(.dark) .sequence-header dd,
:global(.dark) .sequence-shot-prompt,
:global(.dark) .result-stat-grid strong,
:global(.dark) .result-parameter-details p { color: #dbe7e5; }
:global(.dark) .sequence-header h2 span { border-color: #347a6f; color: #83ddd0; background: #15302c; }
:global(.dark) .prompt-tool { background: #14211f; }
:global(.dark) .prompt-tool > header { border-color: #334642; }
:global(.dark) .prompt-tool header strong,
:global(.dark) .prompt-template-grid strong { color: #d6e0de; }
:global(.dark) .prompt-template-grid button,
:global(.dark) .prompt-page-actions button { border-color: #354643; color: #c3cfcc; background: #172321; }

@media (max-width: 1380px) {
  .studio-grid { grid-template-columns: 17rem minmax(390px, 1fr) 21rem; }
  .studio-grid.history-collapsed { grid-template-columns: minmax(390px, 1fr) 21rem; }
}

@media (max-width: 1120px) {
  .studio-grid,
  .studio-grid.history-collapsed { grid-template-columns: minmax(0, 1fr) 350px; }
  .history-panel { display: none; }
  .history-reopen { display: none; }
  .studio-toolbar { grid-template-columns: 1fr auto; }
  .studio-title { display: none; }
  .mode-switch { justify-self: start; width: min(410px, 100%); }
}

@media (max-width: 800px) {
  .creator-studio { height: auto; min-height: auto; overflow: visible; }
  .studio-toolbar { position: sticky; z-index: 8; top: 64px; display: block; padding: 8px; }
  .mode-switch { width: 100%; }
  .toolbar-actions { display: none; }
  .studio-grid,
  .studio-grid.history-collapsed { display: flex; flex: none; flex-direction: column; min-height: auto; overflow: visible; }
  .settings-panel { order: 1; height: auto; border-bottom: 1px solid var(--creator-line); border-left: 0; }
  .settings-scroll { height: auto; max-height: none; padding: 18px 16px 22px; scrollbar-gutter: auto; }
  .canvas-panel { order: 2; height: auto; min-height: 610px; overflow: visible; }
  .inspiration-workspace { padding-top: 30px; }
  .professional-workspace { margin-top: 16px; padding: 13px; }
  .sequence-header { grid-template-columns: minmax(0, 1fr) 38px; }
  .sequence-header dl { display: none; }
  .sequence-track { grid-template-columns: minmax(0, 1fr); }
  .sequence-shot { width: 100%; }
  .brief-stage { height: 460px; }
  .brief-body { grid-template-columns: minmax(0, 1fr); grid-template-rows: 172px minmax(0, 1fr); }
  .brief-summary { padding: 0 0 18px; border-right: 0; border-bottom: 1px solid #33423f; }
  .brief-copy { padding: 18px 0 0; }
  .result-grid { grid-template-columns: 1fr; }
  .complete-video-card > header { align-items: flex-start; flex-direction: column; gap: 10px; }
  .complete-video-card > footer { align-items: flex-start; flex-direction: column; }
  .result-media { height: clamp(280px, 62vh, 460px); }
  .result-media.landscape { height: auto; }
  .result-stat-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 480px) {
  .mode-option { min-height: 40px; }
  .mode-option span { font-size: 11px; }
  .two-column-fields,
  .advanced-grid { grid-template-columns: 1fr; }
  .image-ratio-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .image-size-mode-tabs button { padding: 0 5px; font-size: 11px; }
  .image-custom-size > div { grid-template-columns: 1fr; }
  .image-custom-size > div > span { display: none; }
  .image-size-cancel,
  .image-size-confirm { min-width: 0; flex: 1; }
  .toggle-row.wide { grid-column: auto; }
  .featured-brief { margin-top: 18px; }
  .brief-topline { margin: 0 14px; }
  .brief-body { padding: 18px 14px; }
  .brief-summary h3 { font-size: 23px; }
  .quick-templates { display: none; }
  .sequence-footer { align-items: flex-start; flex-direction: column; }
  .canvas-footnote { margin-right: 12px; margin-left: 12px; }
  .modal-backdrop { padding: 10px; }
}

@media (hover: none) {
  .history-item-actions { opacity: 1; pointer-events: auto; }
}
.image-cost-preview { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 16px 0 8px; padding: 14px 2px 4px; border-top: 1px solid #e8eeed; }
.image-cost-copy { min-width: 0; }
.image-cost-label { color: #53647a; font-size: 12px; font-weight: 600; }
.image-cost-copy p { margin: 4px 0 0; color: #8b98aa; font-size: 11px; line-height: 1.5; }
.image-cost-total { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: flex-end; column-gap: 5px; row-gap: 2px; text-align: right; }
.image-cost-total strong { color: #243448; font-size: 21px; font-weight: 650; letter-spacing: -.6px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.image-cost-total > span { color: #97a3b2; font-size: 10px; font-weight: 500; letter-spacing: .3px; }
.image-cost-total.is-status strong { color: #8b98aa; font-size: 12px; font-weight: 500; letter-spacing: 0; }
.image-price-retry { margin-top: 4px; color: var(--creator-accent-strong); font-size: 11px; text-decoration: underline; text-underline-offset: 3px; }
.image-tier-price { display: block; margin-top: 4px; font-size: 11px; font-weight: 500; }
:global(.dark) .image-cost-preview { border-color: #2c3e42; }
:global(.dark) .image-cost-label { color: #b6c3ce; }
:global(.dark) .image-cost-total strong { color: #e2ecef; }
:global(.dark) .image-cost-total.is-status strong { color: #8b98aa; }
</style>
