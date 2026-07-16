import type { PresentationCompatibility } from '@shot-ai/contracts';

const levelCopy = {
  reliable: '对比适配度：基础可叠加',
  reference_only: '对比适配度：仅供参考',
  side_by_side_only: '对比适配度：仅并排可用',
} as const;

const reasonCopy: Record<PresentationCompatibility['reasons'][number], string> = {
  template_camera_unstable: '参考视频存在相机移动、跳变或变焦',
  user_camera_unstable: '你的视频存在相机移动、跳变或变焦',
  template_view_mismatch: '参考视频不是投篮手侧面角度',
  user_view_mismatch: '你的视频不是投篮手侧面角度',
  template_body_out_of_frame: '参考视频的全身构图或关键点覆盖不足',
  user_body_out_of_frame: '你的视频全身构图或关键点覆盖不足',
  template_pose_unstable: '参考视频的姿态识别不稳定',
  user_pose_unstable: '你的视频姿态识别不稳定',
};

export function CaptureCompatibilityNotice({ compatibility }: { compatibility: PresentationCompatibility }) {
  return (
    <section
      className={`capture-compatibility compatibility-${compatibility.level}`}
      aria-label="拍摄适配度"
    >
      <div>
        <span>CAPTURE COMPATIBILITY</span>
        <strong>{levelCopy[compatibility.level]}</strong>
      </div>
      <p>
        {compatibility.reasons.length > 0
          ? compatibility.reasons.map((reason) => reasonCopy[reason]).join('；')
          : '两侧均通过基础侧面角度、全身覆盖、相机稳定与姿态置信度检查'}
      </p>
      <small>这里只判断素材是否适合当前 2D 展示，不把拍摄差异解释为动作错误。</small>
    </section>
  );
}
