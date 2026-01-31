export interface Project {
    id: string;
    name: string;
    path: string;
    created_at: string;
}
export interface Storage {
    projects: {
        create: (opts: {
            id: string;
            name: string;
            path: string;
        }) => Project;
        getAll: () => Project[];
        getById: (id: string) => Project | undefined;
        getByPath: (path: string) => Project | undefined;
        delete: (id: string) => void;
    };
    close: () => void;
}
