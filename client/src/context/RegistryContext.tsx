import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface Student {
  id: string;
  name: string;
  tc: string;            // OPAQ / TC numarası
  schoolNo?: string;     // Okul numarası (opsiyonel)
  schoolId: string;
  salon: string;
  class: string; // Şube
  freeData?: string;     // Serbest Excel ek sütun verileri (JSON)
}

export interface School {
  id: string;
  name: string;
  districtId: string;
  code: string;
}

export interface District {
  id: string;
  name: string;
}

export interface Exam {
  id: string;
  name: string;
  date: string;
  description: string;
  createdAt: string;
  isActive: string;
  sinavid?: string;
  uploadMode?: string;
}

export interface RegistryMeta {
  sourceFileName: string;
  loadedAt: string;
}

interface RegistryContextType {
  districts: District[];
  schools: School[];
  students: Student[];
  isLoaded: boolean;
  meta: RegistryMeta;
  exams: Exam[];
  selectedExamId: string | null;
  refreshRegistryData: (examId?: string | null) => Promise<void>;
  resetRegistry: () => void;
  loadExams: () => Promise<void>;
  selectExam: (examId: string) => Promise<void>;
  createExam: (exam: Omit<Exam, "id" | "createdAt" | "isActive">) => Promise<Exam>;
}

const RegistryContext = createContext<RegistryContextType | undefined>(undefined);

export function RegistryProvider({ children }: { children: ReactNode }) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [meta, setMeta] = useState<RegistryMeta>({ sourceFileName: "", loadedAt: "" });
  const [isLoaded, setIsLoaded] = useState(false);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);

  const loadExams = async () => {
    const res = await fetch("/api/exams", {
      credentials: "include",
      cache: "no-store",
    });

    if (!res.ok) {
      throw new Error("Sınavlar alınamadı");
    }

    const data: Exam[] = await res.json();
    setExams(data);

    // Set selected exam from localStorage
    const savedExamId = localStorage.getItem("selectedExamId");
    if (savedExamId && data.find((e) => e.id === savedExamId)) {
      setSelectedExamId(savedExamId);
    } else if (data.length > 0) {
      const activeExam = data.find((e) => e.isActive === "1");
      const examToSelect = activeExam || data[0];
      setSelectedExamId(examToSelect.id);
      localStorage.setItem("selectedExamId", examToSelect.id);
    } else {
      setSelectedExamId(null);
      localStorage.removeItem("selectedExamId");
    }
  };

  const selectExam = async (examId: string) => {
    const res = await fetch(`/api/exams/${examId}/activate`, {
      method: "PUT",
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error("Sınav seçilemedi");
    }

    setSelectedExamId(examId);
    localStorage.setItem("selectedExamId", examId);
    await loadExams();
  };

  const createExam = async (examData: Omit<Exam, "id" | "createdAt" | "isActive">) => {
    const res = await fetch("/api/exams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(examData),
    });

    if (!res.ok) {
      throw new Error("Sınav oluşturulamadı");
    }

    const newExam: Exam = await res.json();
    await loadExams();
    return newExam;
  };

  const refreshRegistryData = async (examId?: string | null) => {
    const resolvedExamId = examId ?? selectedExamId;
    const url = resolvedExamId ? `/api/registry?examId=${encodeURIComponent(resolvedExamId)}` : "/api/registry";

    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      headers: resolvedExamId ? { "X-Exam-Id": resolvedExamId } : undefined,
    });

    if (!res.ok) {
      throw new Error("Registry verisi alınamadı");
    }

    const data = (await res.json()) as {
      districts: District[];
      schools: School[];
      students: Student[];
      sourceFileName?: string;
      loadedAt?: string;
    };

    setDistricts(data.districts || []);
    setSchools(data.schools || []);
    setStudents(data.students || []);
    setMeta({
      sourceFileName: data.sourceFileName || "",
      loadedAt: data.loadedAt || "",
    });
    setIsLoaded((data.students?.length || 0) > 0 || (data.schools?.length || 0) > 0 || (data.districts?.length || 0) > 0);
  };

  const resetRegistry = () => {
    setDistricts([]);
    setSchools([]);
    setStudents([]);
    setMeta({ sourceFileName: "", loadedAt: "" });
    setIsLoaded(false);
  };

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      try {
        if (!isMounted) return;
        await loadExams();
      } catch {
        // If DB is unavailable, keep default in-memory empty state.
      }
    };

    void loadData();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedExamId) {
      return;
    }

    resetRegistry();
    void refreshRegistryData(selectedExamId);
  }, [selectedExamId]);

  return (
    <RegistryContext.Provider value={{ districts, schools, students, meta, isLoaded, refreshRegistryData, resetRegistry, exams, selectedExamId, loadExams, selectExam, createExam }}>
      {children}
    </RegistryContext.Provider>
  );
}

export function useRegistry() {
  const context = useContext(RegistryContext);
  if (context === undefined) {
    throw new Error("useRegistry must be used within a RegistryProvider");
  }
  return context;
}
