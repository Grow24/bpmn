import mongoose from "mongoose";

const WorkflowSchema = new mongoose.Schema({
  key: { type: String, index: true, required: true },
  name: { type: String, required: true },
  version: { type: Number, required: true },
  xml: { type: String, required: true },
  status: { type: String, enum: ["draft", "published"], default: "draft" },
  camundaDeploymentId: { type: String },
  createdBy: { type: String },
}, { timestamps: true });

WorkflowSchema.index({ key: 1, version: -1 }, { unique: true });

export default mongoose.model("Workflow", WorkflowSchema);
