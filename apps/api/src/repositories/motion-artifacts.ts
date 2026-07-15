import type {
  MotionArtifact,
  ShootingHand,
  SourceType,
  ViewType,
} from '@shot-ai/contracts';

import type { AppDatabase } from '../db/database.ts';

interface MotionArtifactRow {
  id: string;
  source_file_id: string;
  source_type: SourceType;
  schema_version: string;
  artifact_file_id: string;
  artifact_sha256: string;
  shooting_hand: ShootingHand;
  view_type: ViewType;
  status: string;
  model_version: string;
  pipeline_version: string;
  threshold_snapshot_json: string;
  created_at: string;
}

export interface MotionArtifactRecord {
  id: string;
  sourceFileId: string;
  sourceType: SourceType;
  schemaVersion: string;
  artifactFileId: string;
  artifactSha256: string;
  shootingHand: ShootingHand;
  viewType: ViewType;
  status: string;
  modelVersion: string;
  pipelineVersion: string;
  thresholdSnapshot: Record<string, number | string | boolean>;
  createdAt: string;
}

export class MotionArtifactRepository {
  constructor(private readonly database: AppDatabase) {}

  create(input: {
    artifact: MotionArtifact;
    artifactFileId: string;
    artifactSha256: string;
  }): MotionArtifactRecord {
    const artifact = input.artifact;
    this.database
      .prepare(
        `INSERT INTO motion_artifacts
          (id, source_file_id, source_type, schema_version, artifact_file_id,
           artifact_sha256, shooting_hand, view_type, status, model_version,
           pipeline_version, threshold_snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?)`,
      )
      .run(
        artifact.artifactId,
        artifact.sourceFileId,
        artifact.sourceType,
        artifact.schemaVersion,
        input.artifactFileId,
        input.artifactSha256,
        artifact.capture.shootingHand,
        artifact.capture.detectedView,
        artifact.provenance.modelVersion,
        artifact.provenance.pipelineVersion,
        JSON.stringify(artifact.provenance.thresholdSnapshot),
        artifact.createdAt,
      );
    return this.get(artifact.artifactId)!;
  }

  get(id: string): MotionArtifactRecord | null {
    const row = this.database
      .prepare('SELECT * FROM motion_artifacts WHERE id = ?')
      .get(id) as MotionArtifactRow | undefined;
    return row ? mapArtifact(row) : null;
  }

  remove(id: string): void {
    this.database.prepare('DELETE FROM motion_artifacts WHERE id = ?').run(id);
  }
}

function mapArtifact(row: MotionArtifactRow): MotionArtifactRecord {
  return {
    id: row.id,
    sourceFileId: row.source_file_id,
    sourceType: row.source_type,
    schemaVersion: row.schema_version,
    artifactFileId: row.artifact_file_id,
    artifactSha256: row.artifact_sha256,
    shootingHand: row.shooting_hand,
    viewType: row.view_type,
    status: row.status,
    modelVersion: row.model_version,
    pipelineVersion: row.pipeline_version,
    thresholdSnapshot: JSON.parse(row.threshold_snapshot_json) as Record<
      string,
      number | string | boolean
    >,
    createdAt: row.created_at,
  };
}
