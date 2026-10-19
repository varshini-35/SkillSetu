
import fs from "node:fs";
import path from "node:path";

type RecordData = Record<string, any>;

const root = process.cwd();
const sourceDir = path.join(root, "qualification-data", "ELE-Q5804");
const outputDir = path.join(sourceDir, "generated");
const outputFile = path.join(outputDir, "ele-q5804-provisional.json");

function readJson(name: string): RecordData {
  const file = path.join(sourceDir, name);

  if (!fs.existsSync(file)) {
    throw new Error(`Source file not found: ${file}`);
  }

  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function getStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is string =>
          typeof item === "string" && item.length > 0
      )
    : [];
}

function main() {
  const nosData = readJson("ele_q5804_nos_pc_dataset.json");
  const summary = readJson("ele_q5804_qualification_summary.json");
  const taskData = readJson("ele_q5804_task_nos_mapping.json");
  const vivaData = readJson("ele_q5804_viva_questions.json");
  const practicalData = readJson("ele_q5804_practical_assessment.json");
  const register = readJson("ele_q5804_dataset_register.json");

  const components: RecordData[] = Array.isArray(
    nosData.qualification_components
  )
    ? nosData.qualification_components
    : [];

  const nosComponents = components.filter((component) => {
    const code = String(component.nos_code ?? component.code ?? "");
    return code.startsWith("ELE/") || code.startsWith("DGT/");
  });

  if (nosComponents.length === 0) {
    throw new Error(
      "No NOS components found. Check the source JSON structure."
    );
  }

  const qualification = summary.qualification ?? summary;
  const qualificationCode = String(
    qualification.qualification_code ??
      qualification.code ??
      "ELE/Q5804"
  );
  const qualificationName = String(
    qualification.qualification_name ??
      qualification.name ??
      "Electrician"
  );

  const qpId = "ELE-Q5804-QP-PROVISIONAL";

  const standards = nosComponents.map((component) => {
    const code = String(component.nos_code ?? component.code);

    return {
      id: code,
      qpId,
      title: String(component.title ?? component.nos_title ?? code),
      description: [
        component.description,
        component.duration_hours != null
          ? `Duration: ${component.duration_hours} hours.`
          : "",
        "Draft extraction. Verify against the source PDF."
      ]
        .filter(Boolean)
        .join(" "),
      sourceCode: code,
      sourcePages: component.source_pages ?? null,
      durationHours:
        component.duration_hours ?? component.hours ?? null,
      assessmentMarks: component.assessment_marks ?? null,
      reviewStatus: "DRAFT_EXTRACTION"
    };
  });

  const performanceCriteria: RecordData[] = [];

  for (const component of nosComponents) {
    const nosCode = String(component.nos_code ?? component.code);

    const criteria: RecordData[] = Array.isArray(
      component.performance_criteria
    )
      ? component.performance_criteria
      : [];

    for (const criterion of criteria) {
      const sourcePcId = String(
        criterion.pc_id ??
          criterion.id ??
          `PC-${performanceCriteria.length + 1}`
      );

      const description = String(
        criterion.description ?? criterion.text ?? ""
      ).trim();

      if (!description) continue;

      performanceCriteria.push({
        id: `${safeId(nosCode)}-${safeId(sourcePcId)}`,
        nosId: nosCode,
        description,
        sourcePcId,
        reviewStatus: "DRAFT_EXTRACTION"
      });
    }
  }

  const sourceTasks: RecordData[] = Array.isArray(taskData.tasks)
    ? taskData.tasks
    : [];

  const taskMappings = sourceTasks.map((task, index) => {
    const taskId = String(
      task.task_id ?? task.id ?? `TASK-${index + 1}`
    );

    const candidateNosCodes = getStrings(
      task.candidate_nos_codes ?? task.candidateNosCodes
    );

    const primaryNosCode = candidateNosCodes.find((code) =>
      standards.some((standard) => standard.id === code)
    );

    return {
      id: taskId,
      taskId,
      taskLabel: String(
        task.task_name ??
          task.label ??
          task.name ??
          `Provisional task ${index + 1}`
      ),
      nosId: primaryNosCode ?? "",
      criterionIds: [],
      candidateNosCodes,
      reviewRequired: true,
      mappingStatus: "PROVISIONAL_UNVERIFIED"
    };
  });

  const sourceQuestions: RecordData[] = Array.isArray(
    vivaData.questions
  )
    ? vivaData.questions
    : [];

  const vivaQuestions = sourceQuestions.map((question, index) => {
    const candidateNosCodes = getStrings(
      question.candidate_nos_codes ??
        question.candidateNosCodes
    );

    const primaryNosCode = candidateNosCodes.find((code) =>
      standards.some((standard) => standard.id === code)
    );

    return {
      id: String(
        question.id ??
          `VIVA-ELE-${String(index + 1).padStart(3, "0")}`
      ),
      nosId: primaryNosCode ?? "",
      taskId: "PROVISIONAL-UNMAPPED",
      question: String(question.question ?? ""),
      expectedFocus: String(
        question.suggested_answer ??
          question.expectedFocus ??
          ""
      ),
      followUps: [],
      candidateNosCodes,
      reviewStatus: "DRAFT",
      reviewRequired: true
    };
  });

  const practicalTasks: RecordData[] = Array.isArray(
    practicalData.tasks
  )
    ? practicalData.tasks.map((task: RecordData) => ({
        ...task,
        candidate_nos_codes: getStrings(
          task.candidate_nos_codes ??
            task.candidateNosCodes
        ),
        pc_ids: getStrings(task.pc_ids ?? task.pcIds),
        review_required: true,
        integration_status: "PRESERVED_AS_PROVISIONAL_METADATA"
      }))
    : [];

  const bundle = {
    contentSet: {
      id: "ele-q5804-provisional-v1",
      occupationId: "electrician-ele-q5804",
      name: `${qualificationName} — ${qualificationCode} provisional catalogue`,
      version: "ELE-Q5804-DRAFT-1.0",
      trade: `${qualificationName} (${qualificationCode})`,
      classification: "PROVISIONAL_IMPORTED",
      source:
        "User-provided qualification PDF and draft structured extraction. Current validity and task-to-PC mappings are unverified.",
      approvalReference:
        qualification.approval_reference ??
        qualification.approvalReference ??
        null,
      currentValidityVerified: false,
      productionApproved: false,
      assessmentReady: false,
      integrationWarnings: [
        "Draft extraction; verify criteria against the source PDF.",
        "Current qualification validity is unverified.",
        "Task-to-PC mappings are empty and must not be inferred.",
        "Task-to-NOS associations are provisional.",
        "No official pass/fail threshold is configured.",
        "Scoring anchors require review before live use."
      ],
      sourceRegister: register
    },

    qualificationPacks: [
      {
        id: qpId,
        title: `${qualificationName} — ${qualificationCode} (provisional)`,
        trade: qualificationName,
        nsqfLevel:
          qualification.nsqf_level ??
          qualification.nsqfLevel ??
          4,
        description:
          "Provisional catalogue. Review qualification validity, criteria, task mappings and assessment rules before live use.",
        totalHours:
          qualification.total_hours ??
          qualification.totalHours ??
          540,
        ncrfCredits:
          qualification.ncrf_credits ??
          qualification.ncrfCredits ??
          18,
        reviewStatus: "DRAFT"
      }
    ],

    standards,
    performanceCriteria,
    taskMappings,
    vivaQuestions,

    // Kept as draft metadata, not an approved scoring rubric.
    practicalAssessmentTasks: practicalTasks,

    assessmentMetadata: {
      assessmentMethods:
        qualification.assessment_methods ??
        qualification.assessmentMethods ??
        ["Theory", "Viva voce", "Practical"],
      approvedPassThreshold: null,
      passThresholdVerified: false,
      productionApproved: false,
      sourceFiles: [
        "ele_q5804_dataset_register.json",
        "ele_q5804_nos_pc_dataset.json",
        "ele_q5804_qualification_summary.json",
        "ele_q5804_task_nos_mapping.json",
        "ele_q5804_viva_questions.json",
        "ele_q5804_practical_assessment.json"
      ]
    }
  };

  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    outputFile,
    JSON.stringify(bundle, null, 2) + "\n",
    "utf8"
  );

  console.log("\nProvisional catalogue generated successfully!");
  console.log("Output:", outputFile);
  console.log("NOS standards:", standards.length);
  console.log("Performance criteria:", performanceCriteria.length);
  console.log("Task mappings:", taskMappings.length);
  console.log("Viva questions:", vivaQuestions.length);
  console.log("Practical tasks:", practicalTasks.length);
  console.log("Assessment ready: NO");
  console.log("Runtime store modified: NO");
  console.log("Demo catalogue modified: NO");
  console.log("Live catalogue registered: NO");
}

try {
  main();
} catch (error) {
  console.error(
    "\nAdapter failed:",
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
}
