<template>
  <AppLayout>
    <section class="creator-studio card" aria-label="创作中心">
    <header class="studio-toolbar">
      <div class="studio-title">
        <span class="studio-title-icon"><Icon name="sparkles" size="sm" /></span>
        <span>创作中心</span>
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
        <span class="ready-status"><i></i>已就绪</span>
        <button type="button" class="connection-action" title="刷新工作台状态" aria-label="刷新工作台状态" :disabled="bootstrapping" @click="refreshStudio">
          <Icon name="broadcast" size="sm" :class="{ pulsing: bootstrapping }" />
        </button>
      </div>
    </header>

    <div class="studio-grid" :class="{ 'history-collapsed': historyCollapsed }">
      <aside class="history-panel" aria-label="作品历史">
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

        <div v-if="visibleHistory.length" class="history-list">
          <article
            v-for="work in visibleHistory"
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
              <img v-if="work.type === 'image' && work.outputs[0]" :src="work.outputs[0]" alt="" />
              <video v-else-if="work.type === 'video' && work.outputs[0]" :src="work.outputs[0]" muted />
              <Icon v-else :name="work.type === 'image' ? 'sparkles' : 'play'" size="sm" />
              <span v-if="work.status === 'pending'" class="history-status pending"></span>
              <span v-else-if="work.status === 'failed'" class="history-status failed"></span>
            </span>
            <span class="history-copy">
              <strong>{{ historyWorkTitle(work) }}</strong>
              <small>{{ work.model }} · {{ formatHistoryTime(work.createdAt) }}</small>
            </span>
            <span class="history-item-actions">
              <button type="button" title="打开作品" aria-label="打开作品" @click.stop="selectWork(work)">
                <Icon name="arrowRight" size="xs" />
              </button>
              <button
                type="button"
                class="history-delete"
                title="删除作品"
                aria-label="删除作品"
                @click.stop="removeWork(work)"
              >
                <Icon name="x" size="xs" />
              </button>
            </span>
          </article>
        </div>

        <div v-else class="history-empty">
          <span><Icon name="inbox" size="lg" /></span>
          <strong>还没有{{ historyFilter === 'image' ? '图片' : '视频' }}作品</strong>
          <p>生成的作品会出现在这里</p>
        </div>
      </aside>

      <button
        v-if="historyCollapsed"
        type="button"
        class="history-reopen"
        title="展开作品历史"
        @click="historyCollapsed = false"
      >
        <Icon name="chevronRight" size="sm" />
      </button>

      <main class="canvas-panel">
        <div v-if="generating && generationMode === studioMode" class="generation-state">
          <span class="generation-orbit"><Icon :name="generationMode === 'image' ? 'sparkles' : 'play'" size="lg" /></span>
          <h2>{{ generationMode === 'image' ? '正在绘制你的画面' : '正在制作你的视频' }}</h2>
          <p>{{ generationProgress }}</p>
          <div class="generation-metrics">
            <span>已用时</span>
            <strong>{{ generationElapsedLabel }}</strong>
            <strong v-if="generationMode === 'video' && generationPhase === 'generating'" class="generation-percent">{{ generationPercent }}%</strong>
          </div>
          <div
            v-if="generationPhase === 'generating'"
            class="progress-track"
            :class="{ indeterminate: generationMode === 'image' && !generationHasExactProgress }"
            role="progressbar"
            :aria-valuenow="generationMode === 'video' || generationHasExactProgress ? generationPercent : undefined"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span :style="generationMode === 'video' || generationHasExactProgress ? { width: `${generationPercent}%` } : undefined"></span>
          </div>
          <small class="generation-note">{{ generationMode === 'video' ? '生成完成后会自动加载并保存到本地历史' : '作品生成完成后会自动保存到本地历史' }}</small>
        </div>

        <div v-else-if="selectedWork" class="result-workspace">
          <div class="result-heading result-heading-complete">
            <div>
              <p class="eyebrow">{{ selectedWork.status === 'failed' ? '生成未完成' : '生成结果' }}</p>
              <h2>{{ selectedWork.status === 'failed' ? '这次没有完成' : '本次创作' }}</h2>
              <p>{{ resultMeta(selectedWork) }}</p>
            </div>
            <div class="result-heading-actions">
              <span v-if="selectedWork.status === 'completed'" class="result-count-pill">
                {{ isMultiShotVideo(selectedWork) ? `完整成片 + ${selectedWork.outputs.length} 段` : `${selectedWork.outputs.length} ${selectedWork.type === 'image' ? '张' : '段'}` }}
              </span>
              <button v-if="selectedWork.status === 'completed'" type="button" class="secondary-command" @click="continueCreating">继续创作</button>
              <button v-if="selectedWork.status === 'completed'" type="button" class="secondary-command primary-soft" @click="reuseWork(selectedWork)">再次生成</button>
              <button type="button" class="icon-action danger" title="删除这条作品" @click="removeWork(selectedWork)">
                <Icon name="trash" size="sm" />
              </button>
            </div>
          </div>

          <div v-if="selectedWork.status === 'failed'" class="result-error">
            <Icon name="exclamationTriangle" size="lg" />
            <strong>生成失败</strong>
            <p>{{ selectedWork.error || '请检查模型与参数后重试。' }}</p>
            <button type="button" class="secondary-command" @click="reuseWork(selectedWork)">带回参数重试</button>
          </div>

          <section v-if="selectedWork.status !== 'failed' && selectedWork.outputs.length && isMultiShotVideo(selectedWork)" class="complete-video-card">
            <header>
              <div>
                <p class="eyebrow">完整成片</p>
                <h3>所有镜头已按顺序合成</h3>
                <p>{{ completeVideoDescription(selectedWork) }}</p>
              </div>
              <span>{{ selectedWork.outputs.length }} 个镜头 · {{ selectedWork.requestedDuration || 0 }} 秒</span>
            </header>
            <template v-if="selectedWork.mergedOutput">
              <video
                class="complete-video-media"
                :style="resultMediaStyle(selectedWork)"
                :src="selectedWork.mergedOutput"
                controls
                playsinline
                preload="metadata"
                @error="handleVideoPlaybackError(selectedWork)"
              ></video>
              <footer>
                <div>
                  <strong>完整视频</strong>
                  <span>{{ selectedWork.model }} · {{ selectedWork.aspectRatio || '自动画幅' }} · {{ selectedWork.resolution || '默认清晰度' }}</span>
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
              <span class="result-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <button
                v-if="selectedWork.type === 'image'"
                type="button"
                class="result-media"
                :class="{ landscape: resultIsLandscape(selectedWork) }"
                :style="resultMediaStyle(selectedWork)"
                title="查看大图"
                @click="previewUrl = output"
              >
                <img :src="output" :alt="`生成图片 ${index + 1}`" />
              </button>
              <video v-else class="result-media video result-segment-video" :style="resultMediaStyle(selectedWork)" :src="output" controls playsinline preload="metadata" @error="handleVideoPlaybackError(selectedWork)"></video>
              <div class="result-actions">
                <div class="result-description">
                  <strong>{{ selectedWork.type === 'video' ? `镜头 ${index + 1}` : selectedWork.provider }}</strong>
                  <span>{{ selectedWork.model }} · {{ selectedWork.aspectRatio || '自动画幅' }} · {{ selectedWork.resolution || '默认清晰度' }}</span>
                  <p>{{ resultDescription(selectedWork, index) }}</p>
                </div>
                <div class="result-media-actions">
                  <button type="button" class="icon-action" :title="selectedWork.type === 'image' ? '预览作品' : '播放视频'" @click="previewResult(output, selectedWork.type, index)">
                    <Icon :name="selectedWork.type === 'image' ? 'eye' : 'play'" size="sm" />
                  </button>
                  <button type="button" class="icon-action" title="下载作品" @click="downloadOutput(output, selectedWork, index)">
                    <Icon name="download" size="sm" />
                  </button>
                  <button type="button" class="icon-action" title="继续创作" @click="continueCreating">
                    <Icon name="plus" size="sm" />
                  </button>
                </div>
              </div>
            </article>
          </div>

          <div v-if="selectedWork.status !== 'failed' && selectedWork.outputs.length && isMultiShotVideo(selectedWork)" class="result-grid result-segment-grid">
            <article v-for="(output, index) in selectedWork.outputs" :key="`${selectedWork.id}-segment-${index}`" class="result-card">
              <span class="result-index">{{ String(index + 1).padStart(2, '0') }}</span>
              <video class="result-media video result-segment-video" :style="resultMediaStyle(selectedWork)" :src="output" controls playsinline preload="metadata" @error="handleVideoPlaybackError(selectedWork)"></video>
              <div class="result-actions">
                <div class="result-description">
                  <strong>镜头 {{ index + 1 }}</strong>
                  <span>{{ shotDurationLabel(selectedWork, index) }} · {{ selectedWork.aspectRatio || '自动画幅' }} · {{ selectedWork.resolution || '默认清晰度' }}</span>
                  <p>{{ resultDescription(selectedWork, index) }}</p>
                </div>
                <div class="result-media-actions">
                  <button type="button" class="icon-action" title="播放镜头" @click="previewResult(output, selectedWork.type, index)"><Icon name="play" size="sm" /></button>
                  <button type="button" class="icon-action" title="下载镜头" @click="downloadOutput(output, selectedWork, index)"><Icon name="download" size="sm" /></button>
                  <button type="button" class="icon-action" title="继续创作" @click="continueCreating"><Icon name="plus" size="sm" /></button>
                </div>
              </div>
            </article>
          </div>

          <div v-if="selectedWork.status !== 'failed' && !selectedWork.outputs.length" class="result-error muted">
            <Icon name="clock" size="lg" />
            <strong>任务仍在处理中</strong>
            <p>任务 ID 已保存在本地，可随时重新检查状态。</p>
            <button
              v-if="selectedWork.type === 'video' && selectedWork.requestId"
              type="button"
              class="secondary-command"
              :disabled="checkingVideoHistory"
              @click="refreshVideoWork(selectedWork)"
            >
              {{ checkingVideoHistory ? '正在检查...' : '检查任务状态' }}
            </button>
          </div>

          <section v-if="selectedWork.status === 'completed' && selectedWork.outputs.length" class="result-parameters" aria-label="作品参数">
            <div class="result-stat-grid">
              <article><span>完成耗时</span><strong>{{ formatCompletionDuration(selectedWork) }}</strong></article>
              <article><span>生成时间</span><strong>{{ formatResultTime(selectedWork.completedAt || selectedWork.updatedAt) }}</strong></article>
              <article><span>参考图</span><strong>{{ selectedWork.referenceCount || 0 }} 张</strong></article>
              <article><span>生成数量</span><strong>{{ selectedWork.outputs.length }} {{ selectedWork.type === 'image' ? '张' : '段' }}</strong></article>
              <article><span>版本</span><strong>{{ selectedWork.version || 'v1' }}</strong></article>
              <article><span>来源</span><strong>{{ selectedWork.source || '初版作品' }}</strong></article>
            </div>
            <details class="result-parameter-details" open>
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
              <p>按时间顺序编排画面，点击镜头后可直接编辑参数</p>
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
                    <button type="button" title="向前移动镜头" :disabled="index === 0" @click="moveShot(index, -1)"><Icon name="chevronLeft" size="xs" /></button>
                    <button type="button" title="向后移动镜头" :disabled="index === videoShots.length - 1" @click="moveShot(index, 1)"><Icon name="chevronRight" size="xs" /></button>
                    <button type="button" title="删除镜头" :disabled="videoShots.length === 1" @click="removeShot(index)"><Icon name="x" size="xs" /></button>
                  </div>
                </header>
                <textarea v-model="shot.prompt" maxlength="8000" placeholder="描述这个镜头的画面、动作与运镜"></textarea>
                <footer>
                  <span>{{ referenceImages.length ? '图生' : '文生' }}</span>
                  <span>{{ aspectRatio }}</span>
                  <span>{{ videoResolution }}</span>
                  <label title="调整镜头时长">
                    <input v-model.number="shot.duration" type="range" min="1" max="15" />
                    <strong>{{ shot.duration }} 秒</strong>
                  </label>
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
            <div class="brief-dots">
              <button
                v-for="(_, index) in activeTemplates"
                :key="index"
                type="button"
                :class="{ active: index === activeTemplateIndex }"
                :aria-label="`选择第 ${index + 1} 份企划`"
                @click="selectTemplate(index)"
              ></button>
              <span>{{ activeTemplates.length }} 个视觉方向</span>
            </div>
          </article>

          <div class="quick-templates">
            <span>其他企划</span>
            <button v-for="template in activeTemplates.slice(0, 5)" :key="template.title" type="button" @click="useTemplate(template)">
              {{ template.title }} <Icon name="arrowRight" size="xs" />
            </button>
          </div>
        </div>

        <div class="canvas-footnote"><Icon name="shield" size="xs" /> 当前请求使用你的 Sub2API Key</div>
      </main>

      <aside class="settings-panel" aria-label="生成设置">
        <div class="settings-scroll">
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
              <span v-if="capability.id === 'grok'" class="online-dot"></span>
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
            <select id="creator-model" v-model="selectedModel" class="studio-input" :disabled="loadingModels || !selectedApiKey">
              <option v-if="loadingModels" value="">正在读取可用模型...</option>
              <option v-else-if="!modelOptions.length" value="">请先创建 Key</option>
              <option v-for="model in modelOptions" :key="model" :value="model">{{ modelLabel(model) }}</option>
            </select>
            <small
              v-if="studioMode === 'video'"
              class="video-model-hint"
              :class="{ switched: referenceImages.length }"
              aria-live="polite"
            >
              <span>{{ referenceImages.length
                ? '已根据参考图自动切换为「Grok Imagine 1.5 图生视频」模型。'
                : '只有上传参考图后，才能选择「Grok Imagine 1.5 图生视频」模型；上传后将自动切换。' }}</span>
            </small>
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

          <div class="field-block reference-field">
            <div class="field-row">
              <div><label>参考图</label><small>{{ referenceHint }}</small></div>
              <button type="button" class="inline-command" @click="openFilePicker"><Icon name="upload" size="sm" /> 添加</button>
            </div>
            <input ref="fileInput" type="file" class="sr-only" accept="image/png,image/jpeg,image/webp" multiple @change="handleFileInput" />
            <button
              type="button"
              class="upload-zone"
              :class="{ dragging: isDragging }"
              @click="openFilePicker"
              @dragenter.prevent="isDragging = true"
              @dragover.prevent="isDragging = true"
              @dragleave.prevent="isDragging = false"
              @drop.prevent="handleDrop"
            >
              <Icon name="upload" size="lg" />
              <strong>拖入、粘贴或选择图片</strong>
              <span>PNG / JPG / WEBP · 单张不超过 5MB</span>
            </button>
            <div v-if="referenceImages.length" class="reference-list">
              <div v-for="(reference, index) in referenceImages" :key="reference.url" class="reference-item">
                <img :src="reference.url" :alt="`参考图 ${index + 1}`" />
                <button type="button" title="移除参考图" @click="removeReference(index)"><Icon name="x" size="xs" /></button>
              </div>
            </div>
          </div>

          <template v-if="studioMode === 'image'">
            <div class="two-column-fields">
              <div class="field-block">
                <label for="creator-aspect">画布比例</label>
                <select id="creator-aspect" v-model="aspectRatio" class="studio-input">
                  <option v-for="option in aspectOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
              </div>
              <div class="field-block">
                <label for="creator-resolution">分辨率</label>
                <select id="creator-resolution" v-model="imageResolution" class="studio-input">
                  <option v-for="resolution in imageResolutionOptions" :key="resolution" :value="resolution">{{ resolution }}</option>
                </select>
              </div>
            </div>

            <div v-if="imageCapability === 'image2'" class="advanced-grid">
              <div class="field-block">
                <label for="creator-format">输出格式</label>
                <select id="creator-format" v-model="outputFormat" class="studio-input">
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                  <option value="webp">WebP</option>
                </select>
              </div>
              <div class="field-block">
                <label for="creator-quality">画面质量</label>
                <select id="creator-quality" v-model="imageQuality" class="studio-input">
                  <option value="auto">自动</option>
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </div>
              <label class="toggle-row wide">
                <span><strong>透明背景</strong><small>仅 PNG / WebP 可用</small></span>
                <input v-model="transparentBackground" type="checkbox" :disabled="outputFormat === 'jpeg'" />
                <i></i>
              </label>
            </div>

            <div class="field-block">
              <label>生成数量</label>
              <div class="stepper">
                <button type="button" title="减少数量" :disabled="outputCount <= 1" @click="outputCount--"><Icon name="minus" size="sm" /></button>
                <strong>{{ outputCount }} 张</strong>
                <button type="button" title="增加数量" :disabled="outputCount >= maxOutputCount" @click="outputCount++"><Icon name="plus" size="sm" /></button>
              </div>
              <small v-if="maxOutputCount === 1" class="creator-field-hint">当前 4K 图片模型每次只能生成 1 张；如需一次生成多张，请切换到 1K 或 2K。</small>
            </div>
          </template>

          <template v-else>
            <div class="two-column-fields">
              <div class="field-block">
                <label for="video-aspect">视频比例</label>
                <select id="video-aspect" v-model="aspectRatio" class="studio-input">
                  <option value="16:9">16:9 横屏</option>
                  <option value="9:16">9:16 竖屏</option>
                  <option value="1:1">1:1 方形</option>
                </select>
              </div>
              <div class="field-block">
                <label for="video-resolution">清晰度</label>
                <select id="video-resolution" v-model="videoResolution" class="studio-input">
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                </select>
              </div>
            </div>

            <div class="field-block">
              <label>{{ professionalVideo ? `镜头 ${selectedShotIndex + 1} 时长` : '视频时长' }}</label>
              <div class="stepper">
                <button type="button" title="减少时长" :disabled="configuredVideoDuration <= 1" @click="adjustVideoDuration(-1)"><Icon name="minus" size="sm" /></button>
                <strong>{{ configuredVideoDuration }} 秒</strong>
                <button type="button" title="增加时长" :disabled="configuredVideoDuration >= 15" @click="adjustVideoDuration(1)"><Icon name="plus" size="sm" /></button>
              </div>
            </div>

            <div class="video-duration-estimate" aria-label="预计总时长">
              <span>预计总时长 <strong>{{ estimatedVideoDuration }} 秒</strong></span>
              <small>{{ estimatedVideoMode }}</small>
            </div>

            <label class="toggle-row">
              <span><strong>{{ professionalVideo ? '收起专业工作区' : '展开专业工作区' }}</strong><small>镜头编辑器会显示在主画布</small></span>
              <input v-model="professionalVideo" type="checkbox" />
              <i></i>
            </label>
          </template>

          <button type="button" class="generate-button" :disabled="!canGenerate" @click="startGeneration">
            <Icon v-if="!generating" name="sparkles" size="sm" />
            <span v-else class="button-spinner"></span>
            {{ generating ? '正在生成...' : '开始生成' }}
          </button>
        </div>
      </aside>
    </div>

    <div v-if="previewUrl" class="modal-backdrop image-preview" role="presentation" @click="previewUrl = ''">
      <button type="button" class="preview-close" title="关闭预览" @click="previewUrl = ''"><Icon name="x" size="sm" /></button>
      <img :src="previewUrl" alt="生成图片预览" @click.stop />
    </div>
    </section>
  </AppLayout>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Icon from '@/components/icons/Icon.vue'
import AppLayout from '@/components/layout/AppLayout.vue'
import { keysAPI } from '@/api/keys'
import { userGroupsAPI } from '@/api/groups'
import {
  createCreatorVideo,
  generateCreatorImage,
  getCreatorVideoContent,
  getCreatorVideoStatus,
  listCreatorModels,
} from '@/api/creator'
import {
  creatorHistory,
  type CreatorHistoryItem,
} from '@/services/creatorHistory'
import { useAppStore } from '@/stores/app'
import type { ApiKey, Group } from '@/types'

type StudioMode = 'image' | 'video'
type ImageCapability = 'grok' | 'image2' | 'banner'
type GenerationPhase = 'submitting' | 'generating'

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
}

interface VideoGenerationSnapshot {
  apiKey: string
  model: string
  shots: Array<{ prompt: string; duration: number }>
  resolution: string
  aspectRatio: string
  referenceFile?: File
}

const imageTemplates: PromptTemplate[] = [
  { title: '月光猫影', tag: '角色肖像', subtitle: '冷色月光下的动漫镜头', prompt: '动漫电影风格的白发猫耳少女站在夜色屋顶，银白长发被风轻轻吹起，身后是朦胧城市灯火和一轮明月，冷蓝月光勾勒轮廓，细腻面部特写，浅景深，电影感构图。' },
  { title: '雨夜电车', tag: '环境叙事', subtitle: '潮湿街道与暖色车灯', prompt: '雨后的城市街角，一辆复古电车穿过积水路面，暖黄色车灯映在湿润柏油上，行人撑伞从画面边缘经过，低机位，真实雨雾，克制的电影色彩。' },
  { title: '云上藏书室', tag: '奇想空间', subtitle: '漂浮在云层上的安静书房', prompt: '一间漂浮在云层之上的古老藏书室，巨大的拱形窗外是金色日落，书架与纸页被微风轻轻吹动，柔和体积光，宁静、超现实、极高细节。' },
  { title: '银色相机', tag: '商业静物', subtitle: '复古器物的高级广告质感', prompt: '复古银色相机置于深绿色丝绒桌面，侧面硬光勾勒金属边缘，旁边是一张手写明信片和一小段皮革表带，奢侈品广告摄影，细腻材质，留出干净标题空间。' },
  { title: '雾林肖像', tag: '自然肖像', subtitle: '清晨薄雾中的人物特写', prompt: '年轻女孩站在清晨的雾林中，柔和逆光穿过树叶和薄雾，皮肤质感自然，微风带动发丝，安静真实的情绪，85mm 人像镜头，浅景深。' },
  { title: '深海晚餐', tag: '超现实', subtitle: '海底餐桌与幽蓝光线', prompt: '深海中的白色长桌与精致餐具，水母像吊灯一样漂浮在上方，幽蓝光线穿过海水，桌布缓慢摆动，梦境般安静，超现实时尚大片。' },
  { title: '纸上城市', tag: '纸艺模型', subtitle: '手工折纸搭建的微缩街区', prompt: '完全由白色与红色纸张折叠出的微缩城市，俯视街区布局，小人和车辆具有手工纸艺质感，柔和棚拍光线，清晰阴影，精密模型摄影。' },
  { title: '海风书桌', tag: '生活方式', subtitle: '面朝海岸的安静工作角落', prompt: '面朝海岸的木质书桌，打开的书页被海风轻轻吹动，玻璃杯中有冰水，白色窗帘和远处蓝色海面，午后自然光，清爽真实的生活方式摄影。' },
  { title: '液态音乐节', tag: '视觉海报', subtitle: '银白液态雕塑与霓虹排版', prompt: '极简未来主义音乐节海报，银白色液态雕塑悬浮在深黑背景中央，少量青绿色和金色高光，利落网格排版，强烈材质对比，现代视觉设计。' },
  { title: '玻璃香水', tag: '产品广告', subtitle: '透光材质与水面倒影', prompt: '透明香水瓶立在浅水台面，清晨阳光穿过玻璃形成细碎彩色折射，几片白色花瓣漂浮在水面，干净高级的商业广告构图，真实材质与柔和阴影。' },
  { title: '旧城早餐', tag: '生活纪实', subtitle: '街边烟火与清晨光线', prompt: '老城区街边早餐摊刚刚开张，蒸汽从竹蒸笼升起，店主正在整理桌椅，晨光照进狭窄街巷，真实生活细节，温暖克制的纪实摄影。' },
  { title: '雪山营地', tag: '户外旅行', subtitle: '高山清晨与帐篷灯光', prompt: '雪山脚下的轻量化露营地，橙色帐篷内透出暖光，远处山峰被清晨第一束阳光照亮，空气清透，广角旅行摄影，人物尺度自然。' },
  { title: '机械花园', tag: '科幻概念', subtitle: '金属植物与生态空间', prompt: '未来城市中的机械花园，银色枝叶与真实藤蔓交织，微型维护机器人穿行其间，柔和天光从玻璃穹顶落下，精密而宁静的科幻概念设计。' },
  { title: '东方茶席', tag: '文化静物', subtitle: '宋式美学与自然材质', prompt: '极简东方茶席，青瓷茶具摆放在深色原木桌面，一枝白梅斜入画面，窗格投下柔和光影，留白克制，宋式审美，细腻真实的静物摄影。' },
  { title: '糖果建筑', tag: '创意场景', subtitle: '明快色彩与微缩世界', prompt: '由透明糖果和果冻搭建的微缩现代建筑群，阳光穿透材质形成彩色光斑，微小人物行走其间，明快但不过度饱和，精致模型摄影。' },
  { title: '黑金腕表', tag: '奢品广告', subtitle: '暗调金属与轮廓光', prompt: '黑色机械腕表悬浮在深灰背景中央，暖金色轮廓光划过表圈和齿轮结构，少量烟雾增强层次，极致细节，成熟克制的奢侈品广告摄影。' },
  { title: '窗边阅读', tag: '室内人像', subtitle: '柔光日常与安静情绪', prompt: '年轻人坐在公寓窗边阅读，薄纱窗帘过滤午后阳光，身旁有木椅和绿植，人物状态自然放松，低饱和日常摄影，温柔且真实。' },
  { title: '荒漠信号塔', tag: '电影场景', subtitle: '辽阔空间与孤独叙事', prompt: '广阔荒漠中央矗立一座废弃信号塔，一辆越野车停在塔下，远处沙尘正缓慢靠近，傍晚冷暖交界光线，史诗尺度，电影概念画面。' },
]

const videoTemplates: PromptTemplate[] = [
  { title: '白发猫耳御姐', tag: '角色肖像', subtitle: '动漫镜头 · 缓慢推进', prompt: '镜头缓慢推进，白发猫耳少女站在夜色屋顶回头看向镜头，风吹动长发与衣角，城市灯火在身后形成柔和散景，月光勾勒轮廓，动作自然连贯。' },
  { title: '雨中街角', tag: '环境叙事', subtitle: '电影感 · 低机位跟拍', prompt: '低机位沿雨后街道向前移动，一辆暖黄色电车从画面右侧驶过，积水倒映霓虹和车灯，撑伞行人掠过前景，真实雨雾与自然运动模糊。' },
  { title: '海边奔跑', tag: '动作镜头', subtitle: '自然光 · 手持跟随', prompt: '黄昏海边，一位年轻人沿潮湿沙滩奔跑，镜头在侧后方平稳跟随，海浪拍岸，衣服和头发被海风吹动，金色逆光，充满自由感的电影镜头。' },
  { title: '晨雾森林', tag: '环境肖像', subtitle: '体积光 · 环绕运镜', prompt: '清晨薄雾笼罩森林，镜头缓慢环绕一位穿浅色风衣的人物，树叶间的光束随雾气流动，发丝被微风吹起，动作克制自然，真实电影质感。' },
  { title: '城市追逐', tag: '动作场面', subtitle: '快速剪辑 · 跟拍', prompt: '夜晚城市巷道中的追逐场面，镜头贴近人物快速跟拍，路灯和招牌在背景形成流动光轨，转弯时轻微甩镜，节奏紧凑但主体始终清晰。' },
  { title: '产品旋转', tag: '商业广告', subtitle: '棚拍质感 · 环绕展示', prompt: '高级商业广告镜头，产品放置在深色镜面台上缓慢旋转，窄束轮廓光扫过材质表面，镜头平稳环绕并逐渐靠近，背景干净，细节锐利。' },
  { title: '云海列车', tag: '奇幻场景', subtitle: '航拍推进 · 壮阔', prompt: '一列复古列车穿行在云海之上的高架轨道，镜头从远景俯冲后与列车平行飞行，金色晨光穿透云层，蒸汽向后飘散，宏大而宁静。' },
  { title: '花瓣定格', tag: '视觉实验', subtitle: '慢动作 · 微距', prompt: '微距镜头中花瓣在空中缓慢散开，水滴与细小颗粒被逆光照亮，镜头绕主体轻微旋转，超慢动作，柔和背景虚化，精致梦幻。' },
  { title: '视效海报', tag: '视觉设计', subtitle: '动态图形 · 节奏', prompt: '极简未来主义动态海报，银色液态形体在深色背景中舒展变形，青绿色光线按音乐节奏扫过，排版元素平滑进场，干净利落的视觉设计。' },
  { title: '咖啡拉花', tag: '生活特写', subtitle: '俯拍 · 慢速推进', prompt: '俯拍镜头缓慢靠近咖啡杯，细腻奶泡被倒入并形成完整拉花，桌边晨光逐渐移动，蒸汽轻轻升起，动作连贯，温暖真实的生活广告质感。' },
  { title: '雪山滑行', tag: '户外运动', subtitle: '航拍 · 高速跟随', prompt: '航拍镜头高速跟随滑雪者穿过松软雪坡，转弯扬起细密雪雾，镜头保持主体居中并逐渐拉远，阳光明亮，速度感强且画面稳定。' },
  { title: '茶室光影', tag: '东方美学', subtitle: '横移 · 静谧氛围', prompt: '镜头沿日式茶室缓慢横移，窗格光影落在榻榻米和茶具上，人物抬手斟茶，蒸汽与尘埃在光束中浮动，节奏安静克制。' },
  { title: '机械觉醒', tag: '科幻叙事', subtitle: '特写转全景 · 戏剧光', prompt: '从机器人眼部亮起的极近特写开始，镜头迅速后拉展示巨大的地下机库，机械臂依次启动，冷白灯光沿空间逐排点亮，宏大科幻氛围。' },
  { title: '海岛延时', tag: '自然风光', subtitle: '固定机位 · 时间流逝', prompt: '固定广角镜头记录热带海岛从黄昏进入星夜，云层快速流动，潮水反复漫过沙滩，远处灯塔逐渐亮起，平滑自然的延时摄影。' },
  { title: '珠宝微光', tag: '奢品广告', subtitle: '微距环绕 · 光线扫过', prompt: '微距镜头围绕钻石戒指缓慢旋转，一束窄光依次扫过切面并形成精致高光，黑色背景保持纯净，运动平稳，奢华而克制。' },
  { title: '街舞瞬间', tag: '人物动作', subtitle: '环绕跟拍 · 节拍切换', prompt: '夜晚街头舞者完成连续动作，镜头低机位环绕跟拍并在重拍处轻微变速，路面反射彩色灯光，衣物运动自然，充满节奏和现场感。' },
  { title: '纸船远行', tag: '微缩故事', subtitle: '低机位 · 梦幻叙事', prompt: '一只纸船沿雨后路边的浅水缓缓前行，镜头贴近水面跟随，倒影中的城市灯光被涟漪打散，纸船穿过落叶与水滴，细腻梦幻。' },
  { title: '香水花开', tag: '产品视效', subtitle: '变形转场 · 柔光', prompt: '香水瓶悬浮在浅色空间，透明液体从瓶身周围旋转上升并逐渐变成盛开的花朵，镜头缓慢推进，转化自然顺滑，干净高级的广告视效。' },
]

const imageCapabilities: Array<{ id: ImageCapability; label: string }> = [
  { id: 'grok', label: 'Grok 生图' },
  { id: 'image2', label: 'Image2 生图' },
  { id: 'banner', label: 'Banner 生图' },
]

const defaultAspectOptions = [
  { value: '1:1', label: '1:1 方形' },
  { value: '3:2', label: '3:2 横向' },
  { value: '2:3', label: '2:3 纵向' },
  { value: '16:9', label: '16:9 宽屏' },
  { value: '9:16', label: '9:16 竖屏' },
]

const image2SizeOptions: Record<string, Array<{ value: string; label: string; size: string }>> = {
  '1K': [
    { value: '1:1', label: '1:1 方形 · 1024×1024', size: '1024x1024' },
    { value: '3:2', label: '3:2 横图 · 1536×1024', size: '1536x1024' },
    { value: '2:3', label: '2:3 竖图 · 1024×1536', size: '1024x1536' },
  ],
  '2K': [
    { value: '1:1', label: '1:1 方形 · 2048×2048', size: '2048x2048' },
    { value: '16:9', label: '16:9 横图 · 2048×1152', size: '2048x1152' },
  ],
  '4K': [
    { value: '16:9', label: '16:9 横图 · 3840×2160', size: '3840x2160' },
    { value: '9:16', label: '9:16 竖图 · 2160×3840', size: '2160x3840' },
  ],
}

const appStore = useAppStore()
const studioMode = ref<StudioMode>('image')
const historyFilter = ref<StudioMode>('image')
const imageCapability = ref<ImageCapability>('grok')
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
const videoResolution = ref('720p')
const imageQuality = ref('auto')
const outputFormat = ref('png')
const transparentBackground = ref(false)
const outputCount = ref(1)
const videoDuration = ref(8)
const professionalVideo = ref(false)
const videoShots = ref<VideoShot[]>([{ id: crypto.randomUUID(), prompt: '', duration: 8 }])
const selectedShotId = ref(videoShots.value[0].id)
const historyItems = ref<CreatorHistoryItem[]>([])
const selectedWork = ref<CreatorHistoryItem | null>(null)
const activeTemplateIndex = ref(0)
const bootstrapping = ref(false)
const loadingModels = ref(false)
const creatingKey = ref(false)
const generating = ref(false)
const generationMode = ref<StudioMode | null>(null)
const generationProgress = ref('正在提交生成任务...')
const generationPhase = ref<GenerationPhase>('submitting')
const generationHasExactProgress = ref(false)
const generationPercent = ref(0)
const generationStartedAt = ref(0)
const generationClock = ref(Date.now())
const checkingVideoHistory = ref(false)
const composingWorkId = ref('')
const previewUrl = ref('')
const promptToolExpanded = ref(false)
const promptTemplatePage = ref(0)
const fileInput = ref<HTMLInputElement | null>(null)
const isDragging = ref(false)
let modelRequestSequence = 0
let disposed = false
let generationTimer: number | undefined
let templateAutoplayTimer: number | undefined
const transientObjectUrls = new Set<string>()

const activeTemplates = computed(() => studioMode.value === 'image' ? imageTemplates : videoTemplates)
const activeTemplate = computed(() => activeTemplates.value[activeTemplateIndex.value] || activeTemplates.value[0])
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
    return modelOptions.value.some(isImage2FourKModel) ? ['1K', '2K', '4K'] : ['1K', '2K']
  }
  return ['1K', '2K']
})
const aspectOptions = computed(() => {
  if (studioMode.value === 'image' && imageCapability.value === 'image2') {
    return image2SizeOptions[imageResolution.value] || image2SizeOptions['1K']
  }
  return defaultAspectOptions
})
const maxReferenceImages = computed(() => {
  if (studioMode.value === 'video') return 1
  if (imageCapability.value === 'image2') return 16
  return 3
})
const maxOutputCount = computed(() => isSingleOutputImageModel(selectedModel.value, imageResolution.value, imageCapability.value) ? 1 : 4)
const referenceHint = computed(() => `可选，最多 ${maxReferenceImages.value} 张`)
const selectedGroup = computed(() => groups.value.find(group => group.id === selectedGroupId.value) || null)
const selectedApiKey = computed(() => apiKeys.value.find(key => key.status === 'active' && key.group_id === selectedGroupId.value) || null)
const availableGroups = computed(() => groups.value.filter(group => groupMatchesCurrentCapability(group)))
const imageHistoryCount = computed(() => historyItems.value.filter(item => item.type === 'image').length)
const videoHistoryCount = computed(() => historyItems.value.filter(item => item.type === 'video').length)
const visibleHistory = computed(() => historyItems.value.filter(item => item.type === historyFilter.value))
const totalShotDuration = computed(() => videoShots.value.reduce((sum, shot) => sum + Number(shot.duration || 0), 0))
const selectedShotIndex = computed(() => Math.max(0, videoShots.value.findIndex(shot => shot.id === selectedShotId.value)))
const selectedShot = computed(() => videoShots.value[selectedShotIndex.value] || videoShots.value[0] || null)
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
const configuredVideoDuration = computed(() => professionalVideo.value
  ? Number(selectedShot.value?.duration || 0)
  : videoDuration.value)
const estimatedVideoDuration = computed(() => professionalVideo.value ? totalShotDuration.value : videoDuration.value)
const estimatedVideoMode = computed(() => professionalVideo.value && videoShots.value.length > 1 ? '按镜头顺序拼接' : '单段视频')
const effectivePrompt = computed(() => {
  if (studioMode.value === 'video' && professionalVideo.value) {
    return videoShots.value[0]?.prompt.trim() || ''
  }
  return prompt.value.trim()
})
const canGenerate = computed(() => {
  if (generating.value || !selectedApiKey.value || !selectedModel.value || !effectivePrompt.value || effectivePrompt.value.length > promptLimit.value) return false
  if (studioMode.value === 'video' && professionalVideo.value) {
    return totalShotDuration.value <= 60 && videoShots.value.length > 0 && videoShots.value.every(shot => shot.prompt.trim() && shot.prompt.length <= 8000)
  }
  return true
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
  if (studioMode.value === 'video') return referenceImages.value.length
    ? ['grok-imagine-video-1.5', 'grok-imagine-video']
    : ['grok-imagine-video']
  if (imageCapability.value === 'grok') return ['grok-imagine-image', 'grok-imagine-image-quality']
  if (imageCapability.value === 'image2') return ['gpt-image-2']
  return ['gemini-3-pro-image-preview', 'gemini-2.5-flash-image']
}

function preferredModel() {
  if (studioMode.value === 'video') return referenceImages.value.length
    ? 'grok-imagine-video-1.5'
    : 'grok-imagine-video'
  if (imageCapability.value === 'grok') return 'grok-imagine-image'
  if (imageCapability.value === 'image2') return 'gpt-image-2'
  return 'gemini-3-pro-image-preview'
}

function filterModels(models: string[]) {
  const clean = Array.from(new Set(models.map(model => model.trim()).filter(Boolean)))
  if (studioMode.value === 'video') {
    const videoModels = clean.filter(model => /video/i.test(model))
    if (referenceImages.value.length) return videoModels
    return videoModels.filter(model => !isImageToVideoModel(model))
  }
  if (imageCapability.value === 'grok') return clean.filter(model => /grok.*imag.*image|grok-imagine$/i.test(model))
  if (imageCapability.value === 'image2') return clean.filter(model => /gpt.*image|image-?2/i.test(model))
  return clean.filter(model => /image|imagen|banana/i.test(model))
}

function isImageToVideoModel(model: string) {
  return /^grok-imagine-video-1\.5(?:$|-)/i.test(model.trim())
}

function resolvedVideoModel(model: string, hasReferenceImage: boolean) {
  if (!hasReferenceImage && isImageToVideoModel(model)) return 'grok-imagine-video'
  return model
}

function isImage2FourKModel(model: string) {
  return /gpt[-_]?image[-_]?2/i.test(model) && /(?:^|[-_])4k(?:$|[-_])/i.test(model)
}

function image2FourKModel() {
  return modelOptions.value.find(isImage2FourKModel)
}

function image2StandardModel() {
  return modelOptions.value.find(model => model === 'gpt-image-2')
    || modelOptions.value.find(model => !isImage2FourKModel(model))
}

function syncSelectedGroup() {
  const options = availableGroups.value
  if (!options.some(group => group.id === selectedGroupId.value)) {
    selectedGroupId.value = options[0]?.id || 0
  }
}

async function loadModels() {
  const sequence = ++modelRequestSequence
  modelOptions.value = []
  selectedModel.value = ''
  const key = selectedApiKey.value
  if (!key) return
  loadingModels.value = true
  try {
    const remoteModels = await listCreatorModels(key.key)
    if (sequence !== modelRequestSequence) return
    const filtered = filterModels(remoteModels.map(model => typeof model === 'string' ? model : model.id))
    modelOptions.value = filtered.length ? filtered : fallbackModels()
    selectedModel.value = modelOptions.value.includes(preferredModel())
      ? preferredModel()
      : modelOptions.value[0] || ''
  } catch (error) {
    if (sequence !== modelRequestSequence) return
    modelOptions.value = fallbackModels()
    selectedModel.value = modelOptions.value.includes(preferredModel())
      ? preferredModel()
      : modelOptions.value[0] || ''
  } finally {
    if (sequence === modelRequestSequence) loadingModels.value = false
  }
}

async function refreshStudio() {
  if (bootstrapping.value) return
  bootstrapping.value = true
  try {
    const [available, activeKeys, works] = await Promise.all([
      userGroupsAPI.getAvailable(),
      loadAllActiveKeys(),
      creatorHistory.list(),
    ])
    groups.value = available
    apiKeys.value = activeKeys
    historyItems.value = works
    syncSelectedGroup()
    await loadModels()
  } catch (error) {
    appStore.showError(errorMessage(error, '创作中心加载失败'))
  } finally {
    bootstrapping.value = false
  }
}

async function loadAllActiveKeys() {
  const filters = { status: 'active', sort_by: 'created_at', sort_order: 'desc' as const }
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

function switchMode(mode: StudioMode) {
  if (studioMode.value === mode) return
  studioMode.value = mode
  historyFilter.value = mode
  activeTemplateIndex.value = 0
  selectedWork.value = null
  referenceImages.value.forEach(reference => URL.revokeObjectURL(reference.url))
  referenceImages.value = []
  aspectRatio.value = mode === 'image' ? '1:1' : '16:9'
  if (mode === 'video') selectedShotId.value = videoShots.value[0]?.id || ''
}

function useTemplate(template: PromptTemplate) {
  editorPrompt.value = template.prompt
  document.getElementById('creator-prompt')?.focus()
}

function adjustVideoDuration(delta: -1 | 1) {
  const next = Math.max(1, Math.min(15, configuredVideoDuration.value + delta))
  if (professionalVideo.value && selectedShot.value) {
    selectedShot.value.duration = next
    return
  }
  videoDuration.value = next
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
  if (activeTemplates.value.length <= 1) return
  templateAutoplayTimer = window.setInterval(advanceTemplate, 3000)
}

function previousPromptPage() {
  promptTemplatePage.value = (promptTemplatePage.value - 1 + promptTemplatePageCount.value) % promptTemplatePageCount.value
}

function nextPromptPage() {
  promptTemplatePage.value = (promptTemplatePage.value + 1) % promptTemplatePageCount.value
}

function openFilePicker() {
  fileInput.value?.click()
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  addReferenceFiles(Array.from(input.files || []))
  input.value = ''
}

function handleDrop(event: DragEvent) {
  isDragging.value = false
  addReferenceFiles(Array.from(event.dataTransfer?.files || []))
}

function handlePaste(event: ClipboardEvent) {
  const files = Array.from(event.clipboardData?.files || []).filter(file => file.type.startsWith('image/'))
  if (files.length) addReferenceFiles(files)
}

function addReferenceFiles(files: File[]) {
  const remaining = maxReferenceImages.value - referenceImages.value.length
  if (remaining <= 0) {
    appStore.showError(`最多添加 ${maxReferenceImages.value} 张参考图`)
    return
  }
  const validFiles: File[] = []
  for (const file of files) {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      appStore.showError(`${file.name} 不是支持的图片格式`)
      continue
    }
    if (file.size > 5 * 1024 * 1024) {
      appStore.showError(`${file.name} 超过 5MB`)
      continue
    }
    validFiles.push(file)
  }

  const accepted = validFiles
    .slice(0, remaining)
    .map(file => ({ file, url: URL.createObjectURL(file) }))
  referenceImages.value.push(...accepted)
  if (validFiles.length > remaining) appStore.showError(`已保留前 ${maxReferenceImages.value} 张有效参考图`)
}

function removeReference(index: number) {
  const [removed] = referenceImages.value.splice(index, 1)
  if (removed) URL.revokeObjectURL(removed.url)
}

function sizeForImage() {
  // Image2 only accepts this fixed size catalogue. In particular, its 4K SKU
  // supports 3840x2160 and 2160x3840, not arbitrary <=3840 dimensions.
  if (imageCapability.value === 'image2') {
    const options = image2SizeOptions[imageResolution.value] || image2SizeOptions['1K']
    return options.find(option => option.value === aspectRatio.value)?.size || options[0].size
  }

  const scale = imageResolution.value === '2K' ? 2 : imageResolution.value === '4K' ? 4 : 1
  const base: Record<string, [number, number]> = {
    '1:1': [1024, 1024],
    '3:2': [1536, 1024],
    '2:3': [1024, 1536],
    '16:9': [1536, 864],
    '9:16': [864, 1536],
  }
  const [width, height] = base[aspectRatio.value] || base['1:1']
  return `${width * scale}x${height * scale}`
}

async function startGeneration() {
  if (!canGenerate.value || !selectedApiKey.value || !selectedGroup.value) return
  const taskMode = studioMode.value
  const taskGroup = selectedGroup.value
  const taskApiKey = selectedApiKey.value.key
  const taskProfessionalVideo = taskMode === 'video' && professionalVideo.value
  const taskPrompt = taskProfessionalVideo
    ? videoShots.value.map((shot, index) => `镜头 ${index + 1}：${videoShotPrompt(shot.prompt)}`).join('\n')
    : effectivePrompt.value
  const taskAspectRatio = aspectRatio.value
  const taskReferenceCount = referenceImages.value.length
  const imageSnapshot: ImageGenerationSnapshot | null = taskMode === 'image'
    ? {
        apiKey: taskApiKey,
        platform: taskGroup.platform,
        capability: imageCapability.value,
        model: selectedModel.value,
        prompt: taskPrompt,
        outputCount: Math.min(outputCount.value, maxOutputCount.value),
        size: sizeForImage(),
        quality: imageQuality.value,
        outputFormat: outputFormat.value,
        background: transparentBackground.value && outputFormat.value !== 'jpeg' ? 'transparent' : 'auto',
        referenceFiles: referenceImages.value.map(reference => reference.file),
        aspectRatio: taskAspectRatio,
        resolution: imageResolution.value,
      }
    : null
  const videoSnapshot: VideoGenerationSnapshot | null = taskMode === 'video'
    ? {
        apiKey: taskApiKey,
        model: selectedModel.value,
        shots: taskProfessionalVideo
          ? videoShots.value.map(shot => ({ prompt: videoShotPrompt(shot.prompt), duration: Number(shot.duration) }))
          : [{ prompt: taskPrompt, duration: videoDuration.value }],
        resolution: videoResolution.value,
        aspectRatio: taskAspectRatio,
        referenceFile: referenceImages.value[0]?.file,
      }
    : null
  generating.value = true
  generationMode.value = taskMode
  generationPhase.value = 'submitting'
  generationHasExactProgress.value = false
  generationProgress.value = taskMode === 'image' ? '正在提交画面描述，请稍候' : '正在提交视频任务，请稍候'
  generationStartedAt.value = Date.now()
  generationClock.value = generationStartedAt.value
  if (generationTimer !== undefined) window.clearInterval(generationTimer)
  generationTimer = window.setInterval(() => { generationClock.value = Date.now() }, 1000)
  generationPercent.value = 0
  selectedWork.value = null
  const now = Date.now()
  const work: CreatorHistoryItem = {
    id: crypto.randomUUID(),
    type: taskMode,
    status: 'pending',
    prompt: taskPrompt,
    model: selectedModel.value,
    provider: taskMode === 'image' ? imageCapabilities.find(item => item.id === imageCapability.value)?.label || imageCapability.value : 'Grok 视频',
    groupName: taskGroup.name,
    createdAt: now,
    updatedAt: now,
    outputs: [],
    aspectRatio: taskAspectRatio,
    resolution: taskMode === 'image' ? imageSnapshot?.resolution : videoSnapshot?.resolution,
    referenceCount: taskReferenceCount,
    outputCount: taskMode === 'image' ? imageSnapshot?.outputCount : videoSnapshot?.shots.length,
    requestedDuration: taskMode === 'video' ? videoSnapshot?.shots.reduce((sum, shot) => sum + shot.duration, 0) : undefined,
    shotCount: taskMode === 'video' ? videoSnapshot?.shots.length : undefined,
    shotPrompts: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.prompt) : undefined,
    shotDurations: taskMode === 'video' ? videoSnapshot?.shots.map(shot => shot.duration) : undefined,
    version: 'v1',
    source: '初版作品',
  }
  historyItems.value = [work, ...historyItems.value]
  await persistWork(work)
  try {
    if (taskMode === 'image' && imageSnapshot) await generateImageWork(work, imageSnapshot)
    else if (videoSnapshot) await generateVideoWork(work, videoSnapshot)
    work.status = 'completed'
    work.completedAt = Date.now()
    work.updatedAt = work.completedAt
    work.generationDurationMs = work.completedAt - generationStartedAt.value
    generationPercent.value = 100
    generationProgress.value = '作品已完成'
    await persistWork(work)
    const completedWork = cloneWork(work)
    if (studioMode.value === work.type) selectedWork.value = completedWork
    historyItems.value = historyItems.value.map(item => item.id === work.id ? completedWork : item)
    appStore.showSuccess('作品生成完成')
  } catch (error) {
    work.status = 'failed'
    work.updatedAt = Date.now()
    work.error = creatorGenerationErrorMessage(error)
    await persistWork(work)
    const failedWork = cloneWork(work)
    if (studioMode.value === work.type) selectedWork.value = failedWork
    historyItems.value = historyItems.value.map(item => item.id === work.id ? failedWork : item)
    appStore.showError(work.error)
  } finally {
    generating.value = false
    generationMode.value = null
    if (generationTimer !== undefined) window.clearInterval(generationTimer)
    generationTimer = undefined
  }
}

async function generateImageWork(work: CreatorHistoryItem, input: ImageGenerationSnapshot) {
  generationPhase.value = 'generating'
  generationHasExactProgress.value = false
  generationProgress.value = '正在调用图片模型，请稍候'
  const isGeminiProtocol = input.platform === 'gemini' || input.platform === 'antigravity'
  const usesOpenAIImageSize = input.capability === 'image2'
  const usesBase64Response = !isGeminiProtocol && (usesOpenAIImageSize || input.capability === 'grok')
  const result = await generateCreatorImage(input.apiKey, {
    model: input.model,
    prompt: input.prompt,
    n: input.outputCount,
    size: input.size,
    quality: input.quality,
    outputFormat: input.outputFormat,
    background: input.background,
    // Grok and Image2 may return temporary cross-origin URLs that browsers cannot
    // save through the download attribute. Base64 keeps the result self-contained.
    responseFormat: usesBase64Response ? 'b64_json' : undefined,
    referenceImages: input.referenceFiles,
    protocol: isGeminiProtocol ? 'gemini' : 'openai',
    ...(!usesOpenAIImageSize ? {
      aspectRatio: input.aspectRatio,
      imageSize: input.resolution,
    } : {}),
  })
  work.outputs = result.data.map(item => item.url).filter(Boolean)
  if (!work.outputs.length) throw new Error('模型没有返回可用图片')
}

function isSingleOutputImageModel(model: string, resolution: string, capability: ImageCapability) {
  return capability === 'image2' && (isImage2FourKModel(model) || resolution === '4K')
}

function creatorGenerationErrorMessage(error: unknown) {
  const message = errorMessage(error, '生成失败')
  if (/only supports\s+n\s*=\s*1|supports\s+n\s*=\s*1/i.test(message)) {
    return '当前 4K 图片模型每次只能生成 1 张图片，请将生成数量改为 1，或切换到 1K / 2K 后重试。'
  }
  if (/timeout|timed out|deadline exceeded|network|upstream request failed|gateway timeout|连接|超时|网络/i.test(message)) {
    return '图片模型响应较慢或网络暂时不稳定，网关会自动切换可用通道。请稍后点击“带回参数重试”，不要连续重复提交。'
  }
  return message
}

async function generateVideoWork(work: CreatorHistoryItem, input: VideoGenerationSnapshot) {
  const key = input.apiKey
  const imageDataUrl = input.referenceFile ? await fileToDataUrl(input.referenceFile) : undefined
  const requestModel = resolvedVideoModel(input.model, Boolean(imageDataUrl))
  if (requestModel !== work.model) {
    work.model = requestModel
    work.updatedAt = Date.now()
    await persistWork(work)
  }
  const shots = input.shots
  const outputs: string[] = []
  const outputBlobs: Blob[] = []
  const requestIds: string[] = []
  for (let index = 0; index < shots.length; index++) {
    const shot = shots[index]
    generationPhase.value = 'submitting'
    generationHasExactProgress.value = false
    generationProgress.value = shots.length > 1 ? `正在提交镜头 ${index + 1} / ${shots.length}` : '正在提交视频任务，请稍候'
    generationPercent.value = Math.max(generationPercent.value, Math.round(index / shots.length * 100))
    const created = await createCreatorVideo(key, {
      model: requestModel,
      prompt: shot.prompt,
      duration: shot.duration,
      resolution: input.resolution,
      aspectRatio: input.aspectRatio,
      imageDataUrl,
    })
    if (!created.id) throw new Error('视频接口没有返回任务 ID')
    // A task has entered the provider queue once it returns an ID. Show the
    // determinate bar from the current shot's starting percentage immediately.
    generationPhase.value = 'generating'
    generationHasExactProgress.value = true
    generationPercent.value = Math.max(generationPercent.value, Math.round(index / shots.length * 100))
    generationProgress.value = shots.length > 1
      ? `镜头 ${index + 1} 已提交，正在等待生成`
      : '任务已提交，正在等待生成'
    requestIds.push(created.id)
    work.requestId = requestIds.join(',')
    work.updatedAt = Date.now()
    await persistWork(work)
    const videoBlob = await waitForVideo(key, created.id, index, shots.length)
    outputBlobs.push(videoBlob)
    outputs.push(createTrackedObjectUrl(videoBlob))
    work.outputs = [...outputs]
    work.updatedAt = Date.now()
    await persistWork(work)
  }
  work.outputs = outputs
  if (outputBlobs.length > 1) {
    generationProgress.value = '所有镜头已完成，正在合成完整视频'
    await composeWorkVideo(work, outputBlobs, false)
  }
}

async function waitForVideo(apiKey: string, requestId: string, shotIndex: number, shotCount: number) {
  let monotonicProgress = generationPercent.value

  const updateProgress = (candidate: number) => {
    monotonicProgress = Math.max(monotonicProgress, Math.max(0, Math.min(100, candidate)))
    generationPercent.value = monotonicProgress
  }

  for (let attempt = 0; attempt < 150; attempt++) {
    if (disposed) throw new Error('页面已关闭，任务可稍后从历史记录继续查看')
    if (attempt > 0) await delay(4000)
    const status = await getCreatorVideoStatus(apiKey, requestId)
    const normalized = String(status.status || '').toLowerCase()
    const reportedProgress = Number(status.progress)
    if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) {
      throw new Error(errorMessage(status.error, '视频生成失败'))
    }
    if (['completed', 'succeeded', 'success', 'done'].includes(normalized) || status.url) {
      generationPhase.value = 'generating'
      generationHasExactProgress.value = true
      updateProgress(Math.round((shotIndex + 1) / shotCount * 100))
      generationProgress.value = shotCount > 1 ? `镜头 ${shotIndex + 1} 已完成，正在加载视频` : '视频已生成，正在加载结果'
      return getCreatorVideoContent(apiKey, requestId)
    }
    const isGenerating = ['processing', 'running', 'in_progress', 'generating', 'rendering'].includes(normalized) || Number.isFinite(reportedProgress)
    generationPhase.value = 'generating'
    generationHasExactProgress.value = Number.isFinite(reportedProgress)
    if (generationHasExactProgress.value) {
      // A few providers reuse 100 as a queue/state code before rendering starts.
      // Ignore it for every non-terminal response and reserve 100% for completion.
      if (reportedProgress > 1 && reportedProgress < 100) {
        const exactShotProgress = Math.max(0, reportedProgress)
        updateProgress(Math.round((shotIndex + exactShotProgress / 100) / shotCount * 100))
      }
    }
    generationProgress.value = shotCount > 1
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
    shotPrompts: work.shotPrompts ? [...work.shotPrompts] : undefined,
    shotDurations: work.shotDurations ? [...work.shotDurations] : undefined,
  }
}

function findKeyForWork(work: CreatorHistoryItem) {
  const group = groups.value.find(item => item.name === work.groupName)
  if (group) return apiKeys.value.find(key => key.status === 'active' && key.group_id === group.id) || null
  return apiKeys.value.find(key => key.status === 'active' && key.group?.name === work.groupName) || null
}

function createTrackedObjectUrl(blob: Blob) {
  const objectUrl = URL.createObjectURL(blob)
  transientObjectUrls.add(objectUrl)
  return objectUrl
}

async function selectWork(work: CreatorHistoryItem) {
  selectedWork.value = work
  const hasExpiredObjectUrl = work.outputs.some(output => output.startsWith('blob:'))
  const needsMergedVideo = isMultiShotVideo(work) && !work.mergedOutput
  if (work.type === 'video' && work.requestId && (work.status === 'pending' || hasExpiredObjectUrl || !work.outputs.length || needsMergedVideo)) {
    await refreshVideoWork(work, true)
  }
}

async function refreshVideoWork(work: CreatorHistoryItem, quiet = false) {
  if (checkingVideoHistory.value || !work.requestId) return
  const key = findKeyForWork(work)
  if (!key) {
    if (!quiet) appStore.showError('未找到该作品分组对应的可用 Key')
    return
  }
  checkingVideoHistory.value = true
  try {
    const outputs: string[] = []
    const outputBlobs: Blob[] = []
    let pending = false
    for (const requestId of work.requestId.split(',').map(id => id.trim()).filter(Boolean)) {
      const status = await getCreatorVideoStatus(key.key, requestId)
      const normalized = String(status.status || '').toLowerCase()
      if (['failed', 'error', 'cancelled', 'canceled'].includes(normalized)) {
        work.status = 'failed'
        work.error = errorMessage(status.error, '视频生成失败')
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
    if (outputs.length) work.outputs = outputs
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
    selectedWork.value = historyItems.value.find(item => item.id === work.id) || work
    if (!quiet) appStore.showSuccess(pending ? '任务仍在处理中' : '视频状态已更新')
  } catch (error) {
    if (!quiet) appStore.showError(errorMessage(error, '任务状态检查失败'))
  } finally {
    checkingVideoHistory.value = false
  }
}

async function composeWorkVideo(work: CreatorHistoryItem, blobs: Blob[], notifyFailure: boolean) {
  if (blobs.length < 2) return
  composingWorkId.value = work.id
  work.mergeError = undefined
  try {
    const { composeVideoSegments } = await import('@/services/videoComposer')
    work.mergedOutput = createTrackedObjectUrl(await composeVideoSegments(blobs))
  } catch (error) {
    work.mergedOutput = undefined
    work.mergeError = errorMessage(error, '分段素材已完成，但完整视频合成失败')
    if (notifyFailure) appStore.showWarning(work.mergeError)
  } finally {
    if (composingWorkId.value === work.id) composingWorkId.value = ''
  }
}

async function recomposeVideo(work: CreatorHistoryItem) {
  if (composingWorkId.value) return
  try {
    const blobs = await Promise.all(work.outputs.map(async (output) => {
      const response = await fetch(output)
      if (!response.ok) throw new Error(`读取镜头素材失败：HTTP ${response.status}`)
      return response.blob()
    }))
    await composeWorkVideo(work, blobs, true)
    work.updatedAt = Date.now()
    await persistWork(work)
    historyItems.value = historyItems.value.map(item => item.id === work.id ? cloneWork(work) : item)
    selectedWork.value = historyItems.value.find(item => item.id === work.id) || work
    if (work.mergedOutput) appStore.showSuccess('完整视频已重新合成')
  } catch (error) {
    appStore.showError(errorMessage(error, '完整视频合成失败'))
  }
}

async function removeWork(work: CreatorHistoryItem) {
  await creatorHistory.remove(work.id)
  historyItems.value = historyItems.value.filter(item => item.id !== work.id)
  if (selectedWork.value?.id === work.id) selectedWork.value = null
  appStore.showSuccess('作品记录已删除')
}

function reuseWork(work: CreatorHistoryItem) {
  switchMode(work.type)
  const shotPrompts = workShotPrompts(work)
  if (work.type === 'video' && shotPrompts.length > 1) {
    professionalVideo.value = true
    videoShots.value = shotPrompts.map((shotPrompt, index) => ({
      id: crypto.randomUUID(),
      prompt: shotPrompt,
      duration: work.shotDurations?.[index] || Math.max(1, Math.round((work.requestedDuration || 8) / shotPrompts.length)),
    }))
    selectedShotId.value = videoShots.value[0].id
    prompt.value = ''
  } else {
    prompt.value = work.prompt
  }
  selectedWork.value = null
}

function continueCreating() {
  selectedWork.value = null
  prompt.value = ''
  document.getElementById('creator-prompt')?.focus()
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

function historyWorkTitle(work: CreatorHistoryItem) {
  const firstPrompt = workShotPrompts(work)[0] || work.prompt || '未命名作品'
  return isMultiShotVideo(work) ? `完整成片 · ${firstPrompt}` : firstPrompt
}

function resultDescription(work: CreatorHistoryItem, index: number) {
  return work.type === 'video' ? workShotPrompts(work)[index] || work.prompt : work.prompt
}

function completeVideoDescription(work: CreatorHistoryItem) {
  const count = workShotPrompts(work).length
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

function mergedDownloadName(work: CreatorHistoryItem) {
  return `creator-complete-${work.id}.mp4`
}

function resultMeta(work: CreatorHistoryItem) {
  return `${work.provider} · ${work.model} · ${work.aspectRatio || '自动画幅'} · ${work.resolution || '默认清晰度'}`
}

function resultAspectRatio(work: CreatorHistoryItem) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(work.aspectRatio || '')
  return match ? `${match[1]} / ${match[2]}` : work.type === 'video' ? '16 / 9' : '1 / 1'
}

function resultIsLandscape(work: CreatorHistoryItem) {
  const match = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/.exec(work.aspectRatio || '')
  return work.type === 'image' && !!match && Number(match[1]) > Number(match[2])
}

function resultMediaStyle(work: CreatorHistoryItem) {
  return work.type === 'video' || resultIsLandscape(work)
    ? { aspectRatio: resultAspectRatio(work) }
    : undefined
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
  const parts = [work.provider, work.model, work.aspectRatio || '自动画幅', work.resolution || '默认清晰度']
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
  void video.play().catch(() => undefined)
  video.scrollIntoView({ behavior: 'smooth', block: 'center' })
}

function addShot() {
  if (videoShots.value.length >= 6) return
  const shot = { id: crypto.randomUUID(), prompt: '', duration: 8 }
  videoShots.value.push(shot)
  selectedShotId.value = shot.id
  void nextTick(() => document.querySelector<HTMLElement>(`.sequence-shot[aria-label="选择镜头 ${videoShots.value.length}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }))
}

function removeShot(index: number) {
  if (videoShots.value.length <= 1) return
  const removed = videoShots.value[index]
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
  try {
    const extension = work.type === 'video' ? 'mp4' : imageFileExtension(url)
    const filename = `creator-${Date.now()}-${index + 1}.${extension}`
    let downloadUrl = url
    let temporaryUrl = ''
    if (work.type === 'video' && work.requestId) {
      const key = findKeyForWork(work)
      const requestId = work.requestId.split(',').map(id => id.trim()).filter(Boolean)[index]
      if (!key || !requestId) throw new Error('未找到视频对应的可用 Key 或任务 ID')
      temporaryUrl = URL.createObjectURL(await getCreatorVideoContent(key.key, requestId))
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
    appStore.showError(errorMessage(error, '作品下载失败'))
  }
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

function modelLabel(model: string) {
  const videoLabels: Record<string, string> = {
    'grok-imagine-video': 'Grok Imagine 文生视频',
    'grok-imagine-video-1.5': 'Grok Imagine 1.5 图生视频',
  }
  if (videoLabels[model]) return videoLabels[model]

  const grokImageLabels: Record<string, string> = {
    'grok-imagine-image': 'Grok 标准版生图',
    'grok-imagine-image-quality': 'Grok 高质量版生图',
  }
  if (grokImageLabels[model]) return grokImageLabels[model]

  const labels: Record<string, string> = {
    'gemini-3-pro-image-preview': 'Gemini 3 Pro Image',
    'gemini-2.5-flash-image': 'Gemini 2.5 Flash Image',
  }
  return labels[model] ? `${labels[model]} · ${model}` : model
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

watch([studioMode, imageCapability], () => {
  activeTemplateIndex.value = 0
  promptTemplatePage.value = 0
  selectedWork.value = null
  if (!imageResolutionOptions.value.includes(imageResolution.value)) imageResolution.value = '1K'
  startTemplateAutoplay()
  syncSelectedGroup()
  void loadModels()
})

watch(selectedGroupId, () => {
  void loadModels()
})

watch(maxReferenceImages, maximum => {
  while (referenceImages.value.length > maximum) removeReference(referenceImages.value.length - 1)
})

watch(() => referenceImages.value.length, (count, previousCount) => {
  if (studioMode.value !== 'video' || Boolean(count) === Boolean(previousCount)) return
  void loadModels()
})

watch(outputFormat, format => {
  if (format === 'jpeg') transparentBackground.value = false
})

watch(maxOutputCount, maximum => {
  if (outputCount.value > maximum) outputCount.value = maximum
})

watch(imageResolutionOptions, options => {
  if (!options.includes(imageResolution.value)) imageResolution.value = options[0]
})

watch(imageResolution, resolution => {
  if (studioMode.value !== 'image' || imageCapability.value !== 'image2') return
  const supportedRatios = image2SizeOptions[resolution] || image2SizeOptions['1K']
  if (!supportedRatios.some(option => option.value === aspectRatio.value)) {
    aspectRatio.value = supportedRatios[0].value
  }
  if (resolution === '4K') {
    const fourKModel = image2FourKModel()
    if (fourKModel) selectedModel.value = fourKModel
    return
  }
  if (isImage2FourKModel(selectedModel.value)) {
    selectedModel.value = image2StandardModel() || selectedModel.value
  }
})

watch(aspectOptions, options => {
  if (!options.some(option => option.value === aspectRatio.value)) {
    aspectRatio.value = options[0]?.value || '1:1'
  }
})

watch(selectedModel, model => {
  if (studioMode.value !== 'image' || imageCapability.value !== 'image2' || !model) return
  if (isImage2FourKModel(model)) imageResolution.value = '4K'
  else if (imageResolution.value === '4K') imageResolution.value = '2K'
})

onMounted(() => {
  window.addEventListener('paste', handlePaste)
  startTemplateAutoplay()
  void refreshStudio()
})

onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('paste', handlePaste)
  if (generationTimer !== undefined) window.clearInterval(generationTimer)
  stopTemplateAutoplay()
  referenceImages.value.forEach(reference => URL.revokeObjectURL(reference.url))
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
  --creator-radius-large: 12px;
  position: relative;
  display: flex;
  height: calc(100vh - 8rem);
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
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
.ready-status {
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
  grid-template-columns: 260px minmax(430px, 1fr) 370px;
  min-height: 0;
  flex: 1 1 auto;
  overflow: hidden;
  background: #f3f8f7;
}
.studio-grid.history-collapsed { grid-template-columns: minmax(430px, 1fr) 370px; }
.history-panel,
.settings-panel { min-width: 0; height: 100%; background: #fff; }
.history-panel { display: flex; min-height: 0; flex-direction: column; overflow: hidden; border-right: 1px solid var(--creator-line); }
.history-collapsed .history-panel { display: none; }
.history-reopen { position: absolute; z-index: 4; top: 16px; left: 14px; }

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

.history-list { min-height: 0; flex: 1 1 auto; overflow-y: auto; padding: 0 12px 18px; scrollbar-color: #b7d5d0 transparent; scrollbar-width: thin; }
.history-list::-webkit-scrollbar { width: 8px; }
.history-list::-webkit-scrollbar-track { background: transparent; }
.history-list::-webkit-scrollbar-thumb { border: 2px solid #fff; border-radius: 999px; background: #b7d5d0; }
.history-item { position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr); align-items: center; gap: 10px; width: 100%; min-height: 70px; margin-bottom: 8px; padding: 8px; overflow: hidden; border: 1px solid #dce6e4; border-radius: 8px; text-align: left; background: #fff; box-shadow: 0 2px 8px rgb(29 61 57 / 4%); transition: border-color 150ms ease, background-color 150ms ease, box-shadow 150ms ease; }
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
.history-copy { min-width: 0; align-self: center; transition: padding-right 150ms ease; }
.history-copy strong,
.history-copy small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.history-copy strong { color: #344054; font-size: 12px; font-weight: 700; }
.history-copy small { margin-top: 5px; color: #95a1b2; font-size: 10px; }
.history-preview,
.history-copy { pointer-events: none; }
.history-item-actions { position: absolute; z-index: 2; top: 50%; right: 8px; display: flex; align-items: center; justify-content: flex-end; gap: 1px; opacity: 0; transform: translate(4px, -50%); pointer-events: none; transition: opacity 150ms ease, transform 150ms ease; }
.history-item:hover .history-copy,
.history-item:focus-within .history-copy,
.history-item.active .history-copy { padding-right: 48px; }
.history-item:hover .history-item-actions,
.history-item:focus-within .history-item-actions,
.history-item.active .history-item-actions { opacity: 1; transform: translate(0, -50%); pointer-events: auto; }
.history-item-actions button { display: grid; place-items: center; width: 23px; height: 28px; border-radius: 6px; color: #8295a4; transition: color 130ms ease, background-color 130ms ease; }
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
.professional-workspace { width: min(100% - 48px, 880px); margin: auto; }
.inspiration-workspace { padding: 46px 0 64px; }
.inspiration-intro { text-align: center; }
.inspiration-mark,
.generation-orbit { display: inline-grid; place-items: center; width: 68px; height: 68px; border: 1px solid #79e3d2; border-radius: 8px; color: var(--creator-accent-strong); background: #e8fbf7; }
.eyebrow { margin: 18px 0 10px; color: var(--creator-accent-strong); font-size: 10px; font-weight: 850; letter-spacing: 0; }
.inspiration-intro h2,
.generation-state h2,
.result-heading h2 { margin: 0; color: #172033; font-size: 23px; font-weight: 780; }
.inspiration-intro > p:last-child,
.generation-state > p:not(.eyebrow) { margin: 10px auto 0; color: #7a8799; font-size: 13px; line-height: 1.7; }

.featured-brief { margin-top: 22px; overflow: hidden; border: 1px solid #263c39; border-radius: 8px; color: #eaf1ef; background: #101d1b; box-shadow: 0 24px 48px rgb(20 45 41 / 18%); }
.brief-topline { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 12px; min-height: 60px; margin: 0 24px; border-bottom: 1px solid #2b3e3b; color: #9db3af; font-size: 11px; font-weight: 700; }
.brief-topline > span:first-child { display: flex; align-items: center; gap: 6px; color: #b5d8d1; }
.brief-topline > div { display: flex; gap: 7px; }
.brief-topline button { width: 32px; height: 32px; border-color: #334b47; color: #b9cbc7; background: #182825; }
.brief-stage { min-height: 212px; }
.brief-body { display: grid; grid-template-columns: .9fr 1.2fr; min-height: 212px; padding: 24px; }
.brief-summary { padding-right: 24px; border-right: 1px solid #33423f; }
.brief-summary > span { display: inline-flex; padding: 5px 9px; border: 1px solid #9a7744; border-radius: 6px; color: #d6b374; background: #28251e; font-size: 10px; }
.brief-summary h3 { margin: 16px 0 7px; color: #fff; font-size: 28px; font-weight: 760; }
.brief-summary p { margin: 0; color: #a7b6b3; font-size: 12px; line-height: 1.7; }
.brief-summary small { display: block; margin-top: 26px; color: #788b87; font-size: 10px; }
.brief-copy { display: flex; align-items: flex-start; flex-direction: column; padding-left: 24px; }
.brief-copy > small { color: #c2d3cf; font-size: 10px; font-weight: 800; letter-spacing: 0; }
.brief-copy p { flex: 1; margin: 14px 0; color: #d2dedb; font-size: 13px; line-height: 1.8; }
.brief-copy button { display: inline-flex; align-items: center; gap: 7px; min-height: 40px; padding: 0 14px; border-radius: 7px; color: #2f2b20; background: #dfba69; font-size: 12px; font-weight: 750; }
.brief-copy button:hover { background: #edcc82; }
.brief-slide-enter-active,
.brief-slide-leave-active { transition: opacity 220ms ease, transform 220ms ease; }
.brief-slide-enter-from { opacity: 0; transform: translateX(12px); }
.brief-slide-leave-to { opacity: 0; transform: translateX(-12px); }
.brief-dots { display: flex; align-items: center; min-height: 48px; padding: 0 24px; border-top: 1px solid #263a36; }
.brief-dots button { width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #5c716d; }
.brief-dots button.active { width: 22px; border-radius: 4px; background: #dfba69; }
.brief-dots span { margin-left: auto; color: #70827f; font-size: 10px; }
.quick-templates { flex-wrap: wrap; gap: 8px; margin-top: 16px; }
.quick-templates > span { margin-right: 4px; color: #93a0b0; font-size: 11px; }
.quick-templates button { display: inline-flex; align-items: center; gap: 5px; min-height: 34px; padding: 0 11px; border: 1px solid #d7e5e2; border-radius: 7px; color: #52716d; background: #fff; font-size: 11px; font-weight: 650; }
.quick-templates button:hover { border-color: #93d9ce; color: var(--creator-accent-strong); }

.generation-state { display: grid; justify-items: center; text-align: center; }
.generation-orbit { position: relative; width: 76px; height: 76px; margin-bottom: 18px; border-radius: 50%; animation: creatorPulse 2.2s ease-in-out infinite; }
.generation-orbit::before { position: absolute; inset: 8px; border: 1px solid #9ee8dc; border-radius: 16px; background: #edfcf8; content: ''; }
.generation-orbit::after { position: absolute; inset: -5px; border: 2px solid #a9f0e4; border-right-color: var(--creator-accent-strong); border-radius: 50%; content: ''; animation: creatorSpin 2.4s linear infinite; }
.generation-orbit > svg { position: relative; z-index: 1; }
.generation-metrics { display: flex; align-items: center; gap: 10px; margin-top: 20px; color: var(--creator-accent-strong); font-size: 12px; font-weight: 700; }
.generation-metrics strong { font-size: 14px; font-variant-numeric: tabular-nums; }
.generation-percent { min-width: 42px; padding: 5px 10px; border-radius: 999px; color: var(--creator-accent-strong); background: #d8f8f1; text-align: center; }
.progress-track { width: min(420px, 82%); height: 5px; margin-top: 23px; overflow: hidden; border-radius: 4px; background: #d9f5ef; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: var(--creator-accent-strong); transition: width .6s ease; }
.progress-track.indeterminate span { width: 34%; animation: creatorProgress 1.7s ease-in-out infinite; }
.generation-note { margin-top: 12px; color: #98a8ba; font-size: 10px; }
.result-workspace { padding: 32px 0 64px; }
.result-heading { align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.result-heading > div { min-width: 0; }
.result-heading .eyebrow { margin: 0 0 8px; }
.result-heading > div > p:last-child { display: -webkit-box; max-width: 650px; margin: 9px 0 0; overflow: hidden; color: #778498; font-size: 12px; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.result-heading-complete { align-items: center; }
.result-heading-actions { display: flex; align-items: center; justify-content: flex-end; gap: 7px; }
.result-count-pill { display: inline-flex; align-items: center; min-height: 34px; padding: 0 12px; border: 1px solid #d6e4e1; border-radius: 17px; color: #728093; background: #fff; font-size: 11px; }
.result-heading-actions .secondary-command { border-color: #d6e4e1; color: #3f5d59; }
.result-heading-actions .primary-soft { border-color: #a9e3d9; color: var(--creator-accent-strong); background: #f1fbf8; }
.complete-video-card { overflow: hidden; margin-bottom: 24px; border: 1px solid #cadbd8; border-radius: var(--creator-radius); background: rgb(255 255 255 / 84%); box-shadow: 0 12px 30px rgb(25 74 67 / 10%); }
.complete-video-card > header { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 18px 20px; border-bottom: 1px solid #dce7e5; }
.complete-video-card > header h3 { margin: 4px 0 0; color: #172033; font-size: 18px; }
.complete-video-card > header p:last-child { display: -webkit-box; max-width: 650px; margin: 7px 0 0; overflow: hidden; color: #718094; font-size: 11px; line-height: 1.65; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.complete-video-card > header > span { flex: 0 0 auto; padding: 7px 11px; border: 1px solid #d4e3e0; border-radius: 999px; color: #5d716d; background: #f7faf9; font-size: 10px; }
.complete-video-media { display: block; width: 100%; max-height: min(58vh, 620px); background: #0f1717; object-fit: contain; }
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
.segment-heading h3 { margin: 4px 0 0; color: #263347; font-size: 16px; }
.segment-heading > span { color: #8593a5; font-size: 11px; }
.result-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.result-grid.single { grid-template-columns: minmax(0, 1fr); }
.result-card { position: relative; overflow: hidden; border: 1px solid #d9e4e2; border-radius: 8px; background: #fff; box-shadow: 0 8px 22px rgb(25 74 67 / 8%); }
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
.result-media.video { display: block; width: 100%; height: auto; object-fit: contain; }
.result-actions { justify-content: space-between; gap: 16px; min-height: 66px; padding: 9px 10px 9px 14px; color: #8b98aa; font-size: 11px; }
.result-description { min-width: 0; flex: 1; }
.result-description strong { color: var(--creator-accent-strong); font-size: 11px; }
.result-description span { margin-left: 5px; color: #91a0b2; font-size: 9px; }
.result-description p { overflow: hidden; margin: 5px 0 0; color: #68778b; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.result-segment-grid .result-description p { display: -webkit-box; line-height: 1.45; text-overflow: initial; white-space: normal; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.result-media-actions { display: flex; flex: 0 0 auto; gap: 6px; }
.result-media-actions .icon-action { width: 32px; height: 32px; }
.result-error { display: grid; justify-items: center; padding: 80px 24px; border: 1px dashed #e7b4ae; border-radius: 8px; color: #b64b42; background: #fff8f7; text-align: center; }
.result-error strong { margin-top: 14px; color: #7b312b; }
.result-error p { margin: 7px 0 18px; color: #98635e; font-size: 12px; }
.result-error.muted { border-color: #cbdad7; color: #758a87; background: #f5f9f8; }
.result-error.muted strong { color: #4c615e; }
.result-error.muted p { color: #7d8c8a; }
.result-parameters { margin-top: 14px; }
.result-stat-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
.result-stat-grid article { min-width: 0; min-height: 66px; padding: 12px; border: 1px solid #d6e2e0; border-radius: var(--creator-radius); background: rgb(255 255 255 / 72%); }
.result-stat-grid span,
.result-parameter-details div > span { display: block; color: #91a0b2; font-size: 9px; }
.result-stat-grid strong { display: block; overflow: hidden; margin-top: 7px; color: #334155; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.result-parameter-details { margin-top: 9px; overflow: hidden; border: 1px solid #d6e2e0; border-radius: var(--creator-radius); background: rgb(255 255 255 / 72%); }
.result-parameter-details summary { display: flex; align-items: center; justify-content: space-between; min-height: 42px; padding: 0 13px; color: #78879a; font-size: 10px; cursor: pointer; list-style: none; }
.result-parameter-details summary::-webkit-details-marker { display: none; }
.result-parameter-details summary svg { color: var(--creator-accent-strong); transition: transform 160ms ease; }
.result-parameter-details[open] summary svg { transform: rotate(180deg); }
.result-parameter-details[open] summary { border-bottom: 1px solid #e2e9e8; }
.result-parameter-details > div { padding: 12px 13px 0; }
.result-parameter-details > div:last-child { padding-bottom: 14px; }
.result-parameter-details p { margin: 6px 0 0; color: #435267; font-size: 10px; line-height: 1.7; }
.result-parameter-details .full-prompt { white-space: pre-wrap; }
.secondary-command { min-height: 38px; padding: 0 14px; border: 1px solid #d8b3ad; border-radius: 7px; background: #fff; font-size: 12px; font-weight: 700; }
.canvas-footnote { flex: 0 0 auto; gap: 6px; margin: 0 24px 14px; padding-top: 12px; border-top: 1px solid #dce8e5; color: #9aa8b8; font-size: 10px; }

.professional-workspace { align-self: flex-start; margin-top: 28px; margin-bottom: 70px; padding: 18px; border: 1px solid #d4e2df; border-radius: var(--creator-radius-large); background: rgb(255 255 255 / 76%); box-shadow: 0 14px 32px rgb(36 78 72 / 8%); }
.sequence-shot { cursor: pointer; }
.sequence-shot.active { border-color: #55d4c2; background: #f0fcf9; box-shadow: 0 7px 18px rgb(24 138 121 / 10%); }
.sequence-shot:focus-visible { outline: 2px solid #39b9a5; outline-offset: 2px; }
.sequence-shot.active .sequence-shot-index { border-color: #0f9f8f; color: #fff; background: #0f9f8f; }
.sequence-header { display: grid; grid-template-columns: minmax(0, 1fr) auto 38px; align-items: center; gap: 18px; padding-bottom: 14px; border-bottom: 1px solid #dce8e5; }
.sequence-eyebrow { display: flex; align-items: center; gap: 6px; margin: 0 0 7px; color: var(--creator-accent-strong); font-size: 8px; font-weight: 850; }
.sequence-eyebrow i { width: 7px; height: 7px; border-radius: 50%; background: #39d6bd; box-shadow: 0 0 0 4px #e0faf5; }
.sequence-header h2 { margin: 0; color: #1f2d3d; font-size: 16px; font-weight: 780; }
.sequence-header h2 span { margin-left: 7px; color: var(--creator-accent-strong); font-size: 10px; }
.sequence-header > div:first-child > p:last-child { margin: 5px 0 0; color: #8a98aa; font-size: 9px; }
.sequence-header dl { display: flex; margin: 0; }
.sequence-header dl > div { min-width: 76px; padding: 0 15px; border-left: 1px solid #dae5e3; }
.sequence-header dt { color: #91a0b2; font-size: 8px; }
.sequence-header dd { margin: 5px 0 0; color: #273548; font-size: 12px; font-weight: 750; font-variant-numeric: tabular-nums; }
.sequence-add { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid #92e3d5; border-radius: var(--creator-radius); color: var(--creator-accent-strong); background: #edfcf9; }
.sequence-ruler { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; margin: 12px 0 8px; color: #8fa0b4; font-size: 8px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sequence-ruler i { height: 1px; background: repeating-linear-gradient(90deg, #b9d6d1 0 1px, transparent 1px 22%); border-bottom: 1px solid #d4e3e0; }
.sequence-track { display: flex; gap: 10px; overflow-x: auto; padding: 2px 2px 8px; scroll-snap-type: x proximity; scrollbar-color: #abd8d0 #e7f2f0; scrollbar-width: thin; }
.sequence-shot { position: relative; display: grid; grid-template-columns: 76px minmax(0, 1fr); flex: 0 0 310px; gap: 10px; min-height: 112px; padding: 10px 9px 9px 50px; border: 1px solid #d6e3e1; border-radius: var(--creator-radius); background: #fff; scroll-snap-align: start; }
.sequence-shot::before { position: absolute; top: 39px; bottom: 10px; left: 28px; width: 1px; background: #d9e8e5; content: ''; }
.sequence-shot-index { position: absolute; top: 10px; left: 13px; display: grid; place-items: center; width: 29px; height: 24px; border: 1px solid #b9e1da; border-radius: 6px; color: var(--creator-accent-strong); background: #effbf8; font-size: 9px; font-weight: 800; }
.sequence-shot-preview { position: relative; display: grid; place-items: center; min-height: 88px; overflow: hidden; border: 1px solid #d6e4e1; border-radius: var(--creator-radius-inner); color: var(--creator-accent-strong); background: linear-gradient(135deg, #e8f6f3, #f7fbfa); }
.sequence-shot-preview::before { position: absolute; top: 11px; left: 10px; width: 38px; height: 15px; border-top: 1px solid #bddbd5; border-left: 1px solid #bddbd5; transform: skewX(-28deg); content: ''; }
.sequence-shot-preview > span { position: relative; display: grid; z-index: 1; place-items: center; width: 34px; height: 34px; border: 1px solid #73dac9; border-radius: 50%; background: #dff9f4; }
.sequence-shot-preview small { position: absolute; right: 7px; bottom: 6px; color: #68867f; font-size: 7px; font-weight: 750; font-variant-numeric: tabular-nums; }
.sequence-shot-content { min-width: 0; }
.sequence-shot-content > header { display: flex; align-items: center; gap: 5px; min-height: 24px; }
.sequence-shot-content > header > strong { color: #64748b; font-size: 8px; }
.sequence-shot-content > header > span { display: flex; align-items: center; gap: 3px; color: #91a0b2; font-size: 7px; }
.sequence-shot-content > header > span i { width: 5px; height: 5px; border-radius: 50%; background: #c4d0d8; }
.sequence-shot-content > header > div { display: flex; gap: 1px; margin-left: auto; }
.sequence-shot-content > header button { display: grid; place-items: center; width: 21px; height: 21px; border-radius: 5px; color: #718096; }
.sequence-shot-content > header button:hover:not(:disabled) { color: var(--creator-accent-strong); background: #eff9f7; }
.sequence-shot-content > header button:disabled { opacity: .25; }
.sequence-shot-content textarea { width: 100%; height: 46px; padding: 5px 0; border: 0; outline: 0; resize: none; color: #344054; background: transparent; font-size: 10px; line-height: 1.45; }
.sequence-shot-content textarea::placeholder { color: #a7b3c0; }
.sequence-shot-content footer { display: flex; align-items: center; gap: 4px; }
.sequence-shot-content footer > span { padding: 3px 5px; border: 1px solid #d7e5e2; border-radius: 5px; color: #607b76; background: #f5faf9; font-size: 7px; }
.sequence-shot-content footer label { display: flex; align-items: center; min-width: 58px; flex: 1; gap: 4px; margin-left: 2px; color: #8b98a8; font-size: 7px; }
.sequence-shot-content footer input { min-width: 32px; flex: 1; accent-color: var(--creator-accent); }
.sequence-shot-content footer strong { color: #536579; font-size: 7px; white-space: nowrap; }
.sequence-inline-add { display: grid; flex: 0 0 94px; place-items: center; align-content: center; gap: 7px; min-height: 112px; border: 1px dashed #9ccfc6; border-radius: var(--creator-radius); color: var(--creator-accent-strong); background: #f3fbf9; font-size: 9px; font-weight: 700; scroll-snap-align: start; }
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
.capability-switch button { min-height: 45px; border-radius: 7px; color: #6e7e93; font-size: 12px; font-weight: 700; white-space: nowrap; }
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
textarea.studio-input { padding: 10px 12px; resize: vertical; }
.video-model-hint.switched { color: var(--creator-accent-strong); }
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
.two-column-fields,
.advanced-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.advanced-grid { margin-bottom: 16px; padding: 12px; border: 1px solid #e0e7eb; border-radius: 8px; background: #f8fafb; }
.advanced-grid .field-block { margin-bottom: 0; }
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
.generate-button { min-height: 52px; margin-top: 6px; font-size: 14px; }
.button-spinner { width: 16px; height: 16px; border: 2px solid rgb(255 255 255 / 45%); border-top-color: #fff; border-radius: 50%; animation: creatorSpin .8s linear infinite; }
.spinning { animation: creatorSpin .8s linear infinite; }

/* Keep panels and controls on one corner system while preserving circular status UI. */
.history-tabs,
.history-item,
.history-empty > span,
.featured-brief,
.result-card,
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

.mode-switch { border-radius: var(--creator-radius-large); }
.mode-option,
.studio-title-icon,
.connection-action,
.icon-action,
.collapse-action,
.history-reopen,
.history-count,
.history-tabs button,
.history-preview,
.history-item-actions button,
.brief-topline button,
.brief-copy button,
.quick-templates button,
.secondary-command,
.capability-switch button,
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
.image-preview { z-index: 80; }
.image-preview img { max-width: min(1200px, calc(100vw - 64px)); max-height: calc(100vh - 64px); object-fit: contain; }
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
:global(.dark) .studio-input { color: #ecf3f2; }
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
:global(.dark) .sequence-shot-content textarea,
:global(.dark) .result-stat-grid strong,
:global(.dark) .result-parameter-details p { color: #dbe7e5; }
:global(.dark) .prompt-tool { background: #14211f; }
:global(.dark) .prompt-tool > header { border-color: #334642; }
:global(.dark) .prompt-tool header strong,
:global(.dark) .prompt-template-grid strong { color: #d6e0de; }
:global(.dark) .prompt-template-grid button,
:global(.dark) .prompt-page-actions button { border-color: #354643; color: #c3cfcc; background: #172321; }

@media (max-width: 1380px) {
  .studio-grid { grid-template-columns: 220px minmax(390px, 1fr) 350px; }
  .studio-grid.history-collapsed { grid-template-columns: minmax(390px, 1fr) 350px; }
  .inspiration-workspace,
  .generation-state,
  .result-workspace,
  .professional-workspace { width: min(100% - 34px, 780px); }
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
  .inspiration-workspace,
  .generation-state,
  .result-workspace,
  .professional-workspace { width: calc(100% - 24px); }
  .inspiration-workspace { padding-top: 30px; }
  .professional-workspace { margin-top: 16px; padding: 13px; }
  .sequence-header { grid-template-columns: minmax(0, 1fr) 38px; }
  .sequence-header dl { display: none; }
  .sequence-shot { flex-basis: min(310px, calc(100vw - 72px)); }
  .brief-body { grid-template-columns: 1fr; }
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
  .history-copy { padding-right: 48px; }
  .history-item-actions { opacity: 1; transform: translate(0, -50%); pointer-events: auto; }
}
</style>
