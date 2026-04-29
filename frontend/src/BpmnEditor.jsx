import React, { useEffect, useRef, useState } from "react";
import BpmnModeler from "bpmn-js/lib/Modeler";
import camundaModdle from "camunda-bpmn-moddle/resources/camunda";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "./bpmn.css";

const API_BASE_URL = (process.env.REACT_APP_API_BASE_URL || "http://localhost:4000").replace(/\/$/, "");

const STARTER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
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
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="order_flow">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="173" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Check_di" bpmnElement="Task_Check">
        <dc:Bounds x="270" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="432" y="102" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="flow1_di" bpmnElement="flow1">
        <di:waypoint x="209" y="120" />
        <di:waypoint x="270" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="flow2_di" bpmnElement="flow2">
        <di:waypoint x="370" y="120" />
        <di:waypoint x="432" y="120" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

export default function BpmnEditor() {
  const ref = useRef(null);
  const [modeler, setModeler] = useState(null);
  const [selected, setSelected] = useState(null);
  const [topic, setTopic] = useState("");
  const ALLOWED_TOPICS = ["checkInventory","sendEmail","httpRequest"];

  useEffect(() => {
    let isCancelled = false;
    let m;

    const initModeler = async () => {
      m = new BpmnModeler({
        container: ref.current,
        moddleExtensions: { camunda: camundaModdle }
      });

      await m.importXML(STARTER_XML);

      if (isCancelled) {
        m.destroy();
        return;
      }

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
    };

    initModeler().catch((err) => {
      if (!isCancelled) {
        console.error("BPMN modeler init failed", err);
      } else {
        m?.destroy();
      }
    });

    return () => {
      isCancelled = true;
      m?.destroy();
    };
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
    const res = await fetch(`${API_BASE_URL}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name, xml })
    });
    alert(await res.text());
  };

  const publishLatest = async () => {
    const list = await (await fetch(`${API_BASE_URL}/api/workflows`)).json();
    const draft = list.find(w => w.status === "draft");
    if (!draft) return alert("No draft found. Save a draft first.");
    const res = await fetch(`${API_BASE_URL}/api/workflows/${draft._id}/publish`, { method: "POST" });
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
