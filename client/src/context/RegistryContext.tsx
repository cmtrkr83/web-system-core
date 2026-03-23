import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface Student {
  id: string;
  name: string;
  tc: string;            // OPAQ / TC numarası
  schoolNo?: string;     // Okul numarası (opsiyonel)
  schoolId: string;
  salon: string;
  class: string; // Şube
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
  refreshRegistryData: () => Promise<void>;
  resetRegistry: () => void;
}

const RegistryContext = createContext<RegistryContextType | undefined>(undefined);

export function RegistryProvider({ children }: { children: ReactNode }) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [meta, setMeta] = useState<RegistryMeta>({ sourceFileName: "", loadedAt: "" });
  const [isLoaded, setIsLoaded] = useState(false);

  const refreshRegistryData = async () => {
    const res = await fetch("/api/registry", {
      credentials: "include",
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

    const loadRegistryFromDb = async () => {
      try {
        if (!isMounted) return;

        await refreshRegistryData();
      } catch {
        // If DB is unavailable, keep default in-memory empty state.
      }
    };

    void loadRegistryFromDb();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <RegistryContext.Provider value={{ districts, schools, students, meta, isLoaded, refreshRegistryData, resetRegistry }}>
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
