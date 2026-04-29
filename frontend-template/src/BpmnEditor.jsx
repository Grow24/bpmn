import React, { useEffect, useRef, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import camundaModdle from "camunda-bpmn-moddle/resources/camunda";
import "./bpmn.css";

const STARTER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:camunda="http://camunda.org/schema/1.0/bpmn"
                  id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="order_flow" name="Order Flow" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start"/>
    <bpmn:sequenceFlow id="flow1" sourceRef="StartEvent_1" targetRef="Task_Check"/>
    <bpmn:serviceTask id="Task_Check" name="Check Inventory" camunda:type="external" camunda:topic="checkInventory"/>
    <bpmn:sequenceFlow id="flow2" sourceRef="Task_Check" targetRef="EndEvent_1"/>
    <bpmn:endEvent id="EndEvent_1" name="End"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="order_flow"/>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export default function BpmnEditor() {
  const ref = useRef(null);
  const [modeler, setModeler] = useState(null);
  const [selected, setSelected] = useState(null);
  const [topic, setTopic] = useState("");
  const ALLOWED_TOPICS = ["checkInventory","sendEmail","httpRequest"];

  useEffect(() => {
    const m = new BpmnModeler({
      container: ref.current,
      moddleExtensions: { camunda: camundaModdle }
    });
    m.importXML(STARTER_XML);
    const eventBus = m.get("eventBus");
    eventBus.on("selection.changed", (e) => {
      const el = e.newSelection?.[0] || null;
      setSelected(el);
      if (el?.businessObject?.$type === "bpmn:ServiceTask") {
        setTopic(el.businessObject.get("camunda:topic") || "");
      } else {
        setTopic("");
      }
    });
    setModeler(m);
    return () => m.destroy();
  }, []);

  const setServiceTaskTopic = async (value) => {
    if (!modeler || !selected) return;
    const modeling = modeler.get("modeling");
    const bo = selected.businessObject;
    if (bo?.$type !== "bpmn:ServiceTask") return;
    modeling.updateProperties(selected, {
      "camunda:type": "external",
      "camunda:topic": value
    });
    setTopic(value);
  };

  const saveDraft = async () => {
    const { xml } = await modeler.saveXML({ format: true });
    const key = prompt("Process Definition Key (e.g. order_flow)", "order_flow") || "order_flow";
    const name = prompt("Name", "Order Flow");
    const res = await fetch("http://localhost:4000/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name, xml })
    });
    alert(await res.text());
  };

  const publishLatest = async () => {
    const list = await (await fetch("http://localhost:4000/api/workflows")).json();
    const draft = list.find(w => w.status === "draft");
    if (!draft) return alert("No draft found. Save a draft first.");
    const res = await fetch(`http://localhost:4000/api/workflows/${draft._id}/publish`, { method: "POST" });
    alert(await res.text());
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 12, height: "90vh" }}>
      <div ref={ref} style={{ border: "1px solid #ddd", borderRadius: 8 }} />
      <div style={{ fontFamily: "sans-serif" }}>
        <h3>Properties</h3>
        {selected?.businessObject?.$type === "bpmn:ServiceTask" ? (
          <>
            <div>Service Task ID: {selected.id}</div>
            <label>Topic:&nbsp;
              <select value={topic} onChange={e => setServiceTaskTopic(e.target.value)}>
                <option value="">-- select --</option>
                {ALLOWED_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
          </>
        ) : <div>Select a Service Task to set a topic.</div>}
        <hr />
        <button onClick={saveDraft}>Save Draft</button>
        <button onClick={publishLatest} style={{ marginLeft: 8 }}>Publish Latest Draft</button>
      </div>
    </div>
  );
}
